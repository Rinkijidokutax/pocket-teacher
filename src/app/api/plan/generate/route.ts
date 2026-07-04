import { createClient } from "@/lib/supabase/server";

// Build a day-by-day revision schedule from exam date + weak topics + habits.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId } = (await req.json()) as { courseId: string };
  if (!courseId) return Response.json({ error: "no_course" }, { status: 400 });

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

  const kinds = ["revise", "flashcards", "quiz"] as const;
  // regenerate: clear old, insert fresh
  await supabase.from("study_tasks").delete().eq("user_id", user.id).eq("course_id", courseId);
  const tasks = Array.from({ length: horizon }, (_, d) => {
    const t = weakTopics[d % weakTopics.length];
    const kind = kinds[d % kinds.length];
    const due = new Date(today.getTime() + (d + 1) * msDay).toISOString().slice(0, 10);
    const name = t.topics?.name ?? "revision";
    const title =
      kind === "revise"
        ? `Revise: ${name}`
        : kind === "flashcards"
          ? `Flashcards: ${name}`
          : `Quiz: ${name}`;
    return { user_id: user.id, course_id: courseId, topic_id: t.topic_id, due, title, kind };
  });
  await supabase.from("study_tasks").insert(tasks);

  return Response.json({ ok: true, created: tasks.length, daysToExam });
}
