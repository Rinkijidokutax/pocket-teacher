import { createClient } from "@/lib/supabase/server";

// List the student's exam-style questions for a topic/course (unattempted first). Never returns
// the mark scheme or model answer — those are revealed only after an attempt is submitted.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId");
  const topicId = url.searchParams.get("topicId");
  const difficulty = url.searchParams.get("difficulty");
  if (!courseId) return Response.json({ error: "no_course" }, { status: 400 });

  let q = supabase
    .from("questions")
    .select("id, question_md, marks, command_word, type, difficulty, topic_id")
    .eq("owner_id", user.id)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (topicId) q = q.eq("topic_id", topicId);
  if (difficulty) q = q.eq("difficulty", difficulty);
  const { data: questions } = await q;

  // which of these has the student already attempted?
  const ids = (questions ?? []).map((r) => r.id);
  const { data: attempts } = ids.length
    ? await supabase
        .from("question_attempts")
        .select("question_id, awarded_marks, max_marks")
        .eq("user_id", user.id)
        .in("question_id", ids)
    : { data: [] };
  const done = new Map(
    (attempts ?? []).map((a) => [a.question_id, { awarded: a.awarded_marks, max: a.max_marks }])
  );
  const out = (questions ?? []).map((r) => ({ ...r, attempt: done.get(r.id) ?? null }));
  // unattempted first
  out.sort((a, b) => (a.attempt ? 1 : 0) - (b.attempt ? 1 : 0));

  return Response.json({ ok: true, questions: out });
}
