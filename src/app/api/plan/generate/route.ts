import { createClient } from "@/lib/supabase/server";
import type { Survey } from "@/lib/tutor";

// Build a day-by-day revision schedule from exam date + weak topics + habits.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId } = (await req.json()) as { courseId: string };
  if (!courseId) return Response.json({ error: "no_course" }, { status: 400 });

  // student's stated availability from onboarding (profiles.survey)
  const { data: profile } = await supabase
    .from("profiles")
    .select("survey")
    .eq("id", user.id)
    .single();
  const survey = (profile?.survey ?? {}) as Survey;

  // exam date (enrollment first, then exams table)
  const { data: enr } = await supabase
    .from("enrollments")
    .select("exam_date")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();
  let examDate = enr?.exam_date ?? null;
  if (!examDate) {
    const { data: ex } = await supabase
      .from("exams")
      .select("exam_date")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .order("exam_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    examDate = ex?.exam_date ?? null;
  }

  // weakest topics in this course
  const { data: topics } = await supabase.from("topics").select("id").eq("course_id", courseId);
  const ids = (topics ?? []).map((r) => r.id);
  if (!ids.length) return Response.json({ error: "no_topics" }, { status: 400 });
  const { data: weak } = await supabase
    .from("mastery")
    .select("topic_id, score, topics(name)")
    .eq("user_id", user.id)
    .in("topic_id", ids)
    .order("score", { ascending: true })
    .limit(30);
  const weakTopics = (weak ?? []) as { topic_id: string; topics: { name?: string } | null }[];
  if (!weakTopics.length) return Response.json({ error: "no_mastery" }, { status: 400 });

  // horizon: up to the exam (max 28 days) or 14 days if no exam set
  const today = new Date();
  const msDay = 86400000;
  const daysToExam = examDate
    ? Math.max(1, Math.ceil((new Date(examDate).getTime() - today.getTime()) / msDay))
    : 14;
  const horizon = Math.min(daysToExam, 28);

  // availability: only schedule on the days/week the student agreed to (default 5),
  // and pack a second task on a study day only if their sessions are long (>=60 min).
  const wd = Number(survey.weekly_days);
  const weeklyDays = Number.isFinite(wd) && wd >= 1 && wd <= 7 ? Math.round(wd) : 5;
  const perActiveDay = (survey.minutes ?? 0) >= 60 && weakTopics.length > 1 ? 2 : 1;

  const kinds = ["revise", "flashcards", "quiz"] as const;
  // regenerate: clear old, insert fresh
  await supabase.from("study_tasks").delete().eq("user_id", user.id).eq("course_id", courseId);
  // ponytail: even N-per-week spacing via floor(d*N/7) bucket steps (day 0 always active).
  // study_time is a coarse label, so it's informational only — map it to real weekdays here
  // if scheduling ever needs to hit specific days.
  const tasks: { user_id: string; course_id: string; topic_id: string; due: string; title: string; kind: string }[] = [];
  let i = 0;
  for (let d = 0; d < horizon; d++) {
    const active = Math.floor((d * weeklyDays) / 7) !== Math.floor(((d - 1) * weeklyDays) / 7);
    if (!active) continue;
    const due = new Date(today.getTime() + (d + 1) * msDay).toISOString().slice(0, 10);
    for (let k = 0; k < perActiveDay; k++, i++) {
      const t = weakTopics[i % weakTopics.length];
      const kind = kinds[i % kinds.length];
      const name = t.topics?.name ?? "revision";
      const title =
        kind === "revise"
          ? `Revise: ${name}`
          : kind === "flashcards"
            ? `Flashcards: ${name}`
            : `Quiz: ${name}`;
      tasks.push({ user_id: user.id, course_id: courseId, topic_id: t.topic_id, due, title, kind });
    }
  }
  await supabase.from("study_tasks").insert(tasks);

  return Response.json({ ok: true, created: tasks.length, daysToExam });
}
