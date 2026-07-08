import { createClient } from "@/lib/supabase/server";
import { markExamAnswer, type MarkPoint } from "@/lib/study";
import { applyMasteryUpdate } from "@/lib/tutor";
import { recordActivity } from "@/lib/activity";

export const maxDuration = 60;

// AI-mark a free-text answer against the question's mark scheme, record the attempt, and feed
// the result into mastery + spaced repetition + XP. The feature neither reference site has.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { questionId, answer } = (await req.json()) as { questionId: string; answer: string };
  if (!questionId) return Response.json({ error: "no_question" }, { status: 400 });

  const { data: q } = await supabase
    .from("questions")
    .select("id, question_md, marks, mark_scheme, model_answer_md, topic_id, course_id, is_template, owner_id")
    .eq("id", questionId)
    .maybeSingle();
  // RLS already limits reads to own + templates; double-check ownership for a per-user question.
  if (!q || (!q.is_template && q.owner_id !== user.id))
    return Response.json({ error: "not_found" }, { status: 404 });

  const { data: course } = await supabase
    .from("courses")
    .select("subject")
    .eq("id", q.course_id)
    .maybeSingle();
  const subject = course?.subject ?? "your subject";

  const scheme = (q.mark_scheme ?? []) as MarkPoint[];
  const marking = await markExamAnswer(subject, q.question_md, scheme, answer ?? "", q.marks);

  await supabase.from("question_attempts").insert({
    user_id: user.id,
    question_id: q.id,
    answer: answer ?? "",
    awarded_marks: marking.awarded,
    max_marks: q.marks,
    per_point: marking.per_point,
    feedback_md: marking.feedback,
    misconception: marking.misconception,
  });

  // Feed mastery + spaced repetition: half marks or better counts as "got it".
  const gotIt = q.marks > 0 && marking.awarded / q.marks >= 0.5;
  if (q.topic_id)
    await applyMasteryUpdate(supabase, user.id, {
      topic_id: q.topic_id,
      gotIt,
      misconception: marking.misconception ?? undefined,
    });
  // XP scales with marks earned; a strong answer earns a bonus. Also credits the daily streak.
  const xp = Math.round(marking.awarded * 2) + (gotIt ? 5 : 0);
  await recordActivity(supabase, user.id, xp);

  return Response.json({
    ok: true,
    awarded: marking.awarded,
    max: q.marks,
    perPoint: marking.per_point,
    feedback: marking.feedback,
    misconception: marking.misconception,
    modelAnswer: q.model_answer_md,
    markScheme: scheme,
    xp,
  });
}
