import { createClient } from "@/lib/supabase/server";
import { genExamQuestions } from "@/lib/study";

export const maxDuration = 90;

// Generate original exam-style questions (with a hidden mark scheme) for a topic and persist
// them as the student's own bank. Difficulty adapts to their mastery unless one is passed.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId, topicId, difficulty: reqDiff, count } = (await req.json()) as {
    courseId: string;
    topicId?: string;
    difficulty?: string;
    count?: number;
  };
  if (!courseId) return Response.json({ error: "no_course" }, { status: 400 });

  const { data: course } = await supabase
    .from("courses")
    .select("subject, board, level, syllabus_code")
    .eq("id", courseId)
    .maybeSingle();
  const subject = course?.subject ?? "your subject";
  const exam = course?.board
    ? `${course.board} ${(course.level ?? "").toUpperCase().replace(/_/g, " ")}`.trim() +
      (course.syllabus_code ? ` (syllabus ${course.syllabus_code})` : "")
    : "";

  const { data: prof } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .maybeSingle();
  const lang = prof?.language ?? "en";

  // resolve topic (given, else weakest in course) + adaptive difficulty from mastery
  let tid = topicId ?? null;
  let topicName = "key concepts";
  let score = 40;
  if (!tid) {
    const { data: topics } = await supabase.from("topics").select("id").eq("course_id", courseId);
    const ids = (topics ?? []).map((r) => r.id);
    const { data: weak } = await supabase
      .from("mastery")
      .select("topic_id, score, topics(name)")
      .eq("user_id", user.id)
      .in("topic_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .order("score", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (weak) {
      tid = weak.topic_id;
      score = weak.score;
      topicName = (weak.topics as { name?: string } | null)?.name ?? topicName;
    }
  } else {
    const { data: t } = await supabase.from("topics").select("name").eq("id", tid).maybeSingle();
    topicName = t?.name ?? topicName;
    const { data: m } = await supabase
      .from("mastery")
      .select("score")
      .eq("user_id", user.id)
      .eq("topic_id", tid)
      .maybeSingle();
    score = m?.score ?? 40;
  }
  if (!tid) return Response.json({ error: "no_topic" }, { status: 400 });
  // whitelist difficulty; clamp count to 1..6 (NaN/0/negative would poison the prompt)
  const difficulty = ["easy", "medium", "hard"].includes(reqDiff ?? "")
    ? (reqDiff as string)
    : score < 40 ? "easy" : score < 70 ? "medium" : "hard";
  const n = Math.min(Math.max(Math.round(Number(count)) || 4, 1), 6);

  const qs = await genExamQuestions(subject, topicName, difficulty, exam, n, lang);
  if (!qs.length) return Response.json({ error: "generation_failed" }, { status: 502 });

  const rows = qs.map((q) => ({
    owner_id: user.id,
    is_template: false,
    course_id: courseId,
    topic_id: tid,
    type: q.type,
    command_word: q.command_word || null,
    question_md: q.question_md,
    marks: q.marks,
    difficulty: q.difficulty,
    mark_scheme: q.mark_scheme,
    model_answer_md: q.model_answer_md || null,
    source: "generated",
  }));
  const { data: inserted, error: insertErr } = await supabase
    .from("questions")
    .insert(rows)
    .select("id, question_md, marks, command_word, type, difficulty");
  if (insertErr || !inserted?.length) {
    console.error("questions insert failed:", insertErr?.message);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }

  return Response.json({ ok: true, topic: topicName, difficulty, questions: inserted });
}
