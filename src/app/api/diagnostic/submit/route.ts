import { createClient } from "@/lib/supabase/server";

// Seed the mastery map from diagnostic answers: correct -> higher baseline.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { quizId, answers } = (await req.json()) as { quizId: string; answers: number[] };
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("questions, course_id")
    .eq("id", quizId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!quiz) return Response.json({ error: "not_found" }, { status: 404 });

  const qs = quiz.questions as { answer: number; topic_id: string | null }[];
  let score = 0;
  const updates: { user_id: string; topic_id: string; score: number }[] = [];
  qs.forEach((q, i) => {
    const correct = answers[i] === q.answer;
    if (correct) score++;
    if (q.topic_id)
      updates.push({ user_id: user.id, topic_id: q.topic_id, score: correct ? 60 : 20 });
  });
  if (updates.length)
    await supabase.from("mastery").upsert(updates, { onConflict: "user_id,topic_id" });

  return Response.json({ ok: true, score, total: qs.length });
}
