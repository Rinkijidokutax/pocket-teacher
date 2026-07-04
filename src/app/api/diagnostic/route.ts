import { createClient } from "@/lib/supabase/server";
import { genDiagnostic } from "@/lib/study";

export const maxDuration = 90;

// GET: build a short diagnostic spread across a course's topics.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId } = (await req.json()) as { courseId: string };
  const { data: course } = await supabase
    .from("courses")
    .select("subject")
    .eq("id", courseId)
    .maybeSingle();
  const subject = course?.subject ?? "the subject";

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name")
    .eq("course_id", courseId)
    .order("sort");
  const all = (topics ?? []) as { id: string; name: string }[];
  if (all.length === 0) return Response.json({ error: "no_topics" }, { status: 400 });

  // evenly spread ~6 topics across the syllabus
  const n = Math.min(6, all.length);
  const step = Math.max(1, Math.floor(all.length / n));
  const picked = Array.from({ length: n }, (_, i) => all[Math.min(i * step, all.length - 1)]);

  const qs = (await genDiagnostic(subject, picked.map((t) => t.name))).slice(0, 6);
  if (!qs.length) return Response.json({ ok: true, quizId: null, questions: [] });

  const questions = qs.map((q) => ({
    q: q.q,
    options: q.options,
    answer: q.answer,
    topic_id: picked[Math.min(q.topicIndex, picked.length - 1)]?.id ?? null,
  }));

  const { data: quiz } = await supabase
    .from("quizzes")
    .insert({ user_id: user.id, course_id: courseId, title: "Diagnostic", questions })
    .select("id")
    .single();

  return Response.json({
    ok: true,
    quizId: quiz?.id,
    questions: questions.map((q) => ({ q: q.q, options: q.options })),
  });
}
