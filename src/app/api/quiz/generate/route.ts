import { createClient } from "@/lib/supabase/server";
import { genQuiz } from "@/lib/study";

export const maxDuration = 90;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId, topicId, materialId } = (await req.json()) as {
    courseId: string;
    topicId?: string;
    materialId?: string;
  };
  if (!courseId) return Response.json({ error: "no_course" }, { status: 400 });

  const { data: prof } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .maybeSingle();
  const lang = prof?.language ?? "en";

  const { data: course } = await supabase
    .from("courses")
    .select("subject, board, level")
    .eq("id", courseId)
    .maybeSingle();
  const subject = course?.subject ?? "your subject";
  const exam = course?.board
    ? `${course.board} ${(course.level ?? "").toUpperCase().replace(/_/g, " ")}`.trim()
    : "";

  // topic + difficulty from mastery (adaptive: weaker => easier)
  let topicName = "key concepts";
  let tid = topicId ?? null;
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
    const { data: t } = await supabase
      .from("topics")
      .select("name")
      .eq("id", tid)
      .maybeSingle();
    topicName = t?.name ?? topicName;
    const { data: m } = await supabase
      .from("mastery")
      .select("score")
      .eq("user_id", user.id)
      .eq("topic_id", tid)
      .maybeSingle();
    score = m?.score ?? 40;
  }
  const difficulty = score < 40 ? "easy" : score < 70 ? "medium" : "hard";

  // Quiz-from-notes: ground the quiz in the student's own material when one is passed.
  let source: string | null = null;
  if (materialId) {
    const { data: m } = await supabase
      .from("materials")
      .select("extracted_text")
      .eq("id", materialId)
      .eq("user_id", user.id)
      .maybeSingle();
    source = m?.extracted_text ?? null;
  }

  // Pass the quiz's real topic(s) so each question can carry its own topic_id for per-topic
  // mastery on submit. Today the route resolves a single topic, but the list keeps it open.
  const quizTopics = tid ? [{ id: tid, name: topicName }] : [];
  const questions = await genQuiz(subject, [topicName], source, 6, difficulty, exam, lang, undefined, undefined, quizTopics);
  if (!questions.length) return Response.json({ error: "generation_failed" }, { status: 502 });

  // Resolve each question's TOPIC index → concrete topic_id; fall back to the single topic (tid).
  const withTopic = questions.map((q) => ({
    ...q,
    topic_id: quizTopics[Math.min(q.topicIndex ?? 0, quizTopics.length - 1)]?.id ?? tid,
  }));
  const { data: quiz } = await supabase
    .from("quizzes")
    .insert({ user_id: user.id, course_id: courseId, topic_id: tid, title: topicName, questions: withTopic })
    .select("id")
    .single();

  // strip answers before returning to the client
  return Response.json({
    ok: true,
    quizId: quiz?.id,
    title: topicName,
    questions: questions.map((q) => ({ q: q.q, options: q.options })),
  });
}
