import { createClient } from "@/lib/supabase/server";
import { applyMasteryUpdate } from "@/lib/tutor";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { quizId, answers } = (await req.json()) as { quizId: string; answers: number[] };
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("questions, topic_id")
    .eq("id", quizId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!quiz) return Response.json({ error: "not_found" }, { status: 404 });

  const qs = quiz.questions as { answer: number }[];
  const correctAnswers = qs.map((q) => q.answer);
  let score = 0;
  qs.forEach((q, i) => {
    if (answers[i] === q.answer) score++;
  });
  const total = qs.length;
  const passed = total > 0 && score / total >= 0.6;

  // update mastery on the quiz's topic, award quiz XP
  if (quiz.topic_id)
    await applyMasteryUpdate(supabase, user.id, { topic_id: quiz.topic_id, gotIt: passed });
  const xp = score * 3 + (passed ? 10 : 0);
  if (xp) {
    const { data: p } = await supabase.from("profiles").select("xp").eq("id", user.id).maybeSingle();
    await supabase.from("profiles").update({ xp: (p?.xp ?? 0) + xp }).eq("id", user.id);
  }

  await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    quiz_id: quizId,
    score,
    total,
    answers,
  });

  return Response.json({ ok: true, score, total, correctAnswers, xp });
}
