import { createClient } from "@/lib/supabase/server";
import { applyMasteryUpdate } from "@/lib/tutor";
import { recordActivity } from "@/lib/activity";

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

  const qs = quiz.questions as { answer: number; explanation?: string; topic_id?: string | null }[];
  const correctAnswers = qs.map((q) => q.answer);
  const explanations = qs.map((q) => q.explanation ?? null);
  let score = 0;
  qs.forEach((q, i) => {
    if (answers[i] === q.answer) score++;
  });
  const total = qs.length;
  const passed = total > 0 && score / total >= 0.6;

  // Per-topic mastery: group each answered question by its own topic_id and update mastery
  // once per topic with that topic's graded fraction — so a multi-topic quiz feeds every topic
  // it covers, not one binary update for the whole quiz. Older quizzes whose questions lack a
  // topic_id fall back to the quiz-level topic_id, so nothing regresses.
  const byTopic = new Map<string, { correct: number; total: number }>();
  qs.forEach((q, i) => {
    const t = q.topic_id ?? quiz.topic_id;
    if (!t) return;
    const g = byTopic.get(t) ?? { correct: 0, total: 0 };
    g.total++;
    if (answers[i] === q.answer) g.correct++;
    byTopic.set(t, g);
  });
  // sanity: grouped question count must not exceed the graded total
  console.assert(
    [...byTopic.values()].reduce((s, g) => s + g.total, 0) <= total,
    "quiz submit: per-topic totals exceed question count"
  );
  for (const [topic_id, g] of byTopic)
    await applyMasteryUpdate(supabase, user.id, {
      topic_id,
      gotIt: g.correct / g.total >= 0.6,
      q: g.correct / g.total,
    });
  // Credit XP AND the daily streak — finishing a quiz counts toward the habit, not just chat.
  const xp = score * 3 + (passed ? 10 : 0);
  await recordActivity(supabase, user.id, xp);

  await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    quiz_id: quizId,
    score,
    total,
    answers,
  });

  return Response.json({ ok: true, score, total, correctAnswers, xp, explanations });
}
