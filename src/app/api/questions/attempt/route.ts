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
    .select("id, question_md, marks, command_word, mark_scheme, model_answer_md, topic_id, course_id, is_template, owner_id")
    .eq("id", questionId)
    .maybeSingle();
  // RLS already limits reads to own + templates; double-check ownership for a per-user question.
  if (!q || (!q.is_template && q.owner_id !== user.id))
    return Response.json({ error: "not_found" }, { status: 404 });

  const { data: course } = await supabase
    .from("courses")
    .select("subject, exam_date")
    .eq("id", q.course_id)
    .maybeSingle();
  const subject = course?.subject ?? "your subject";
  const daysToExam = course?.exam_date
    ? Math.ceil((new Date(course.exam_date).getTime() - Date.now()) / 86400000)
    : null;

  // Re-attempts after the mark scheme was revealed still get marked, but earn no XP/mastery.
  const { data: prior } = await supabase
    .from("question_attempts")
    .select("id")
    .eq("user_id", user.id)
    .eq("question_id", q.id)
    .limit(1)
    .maybeSingle();
  const isRepeat = !!prior;

  const scheme = (q.mark_scheme ?? []) as MarkPoint[];
  // Feed the command word's definition + examiner expectation into the marker so it can flag
  // misread command words. Skip the lookup when the question carries no command word.
  let commandHelp: string | undefined;
  if (q.command_word) {
    const { data: cw } = await supabase
      .from("command_words")
      .select("definition_md, guidance_md")
      .eq("word", q.command_word)
      .maybeSingle();
    if (cw) commandHelp = `${cw.definition_md} ${cw.guidance_md}`;
  }
  // Cap the answer reaching the marker prompt — no student answer legitimately needs more.
  const ans = (answer ?? "").slice(0, 4000);
  const marking = await markExamAnswer(
    subject, q.question_md, scheme, ans, q.marks, commandHelp, q.model_answer_md ?? undefined
  );
  // Marker unavailable (model outage/format drift) — fail loudly, never record a false zero.
  if (!marking) return Response.json({ error: "marking_unavailable" }, { status: 502 });

  const { error: attemptErr } = await supabase.from("question_attempts").insert({
    user_id: user.id,
    question_id: q.id,
    answer_md: ans,
    awarded_marks: marking.awarded,
    max_marks: q.marks,
    per_point: marking.per_point,
    feedback_md: marking.feedback,
    misconception: marking.misconception,
  });
  if (attemptErr) {
    console.error("question_attempt insert failed:", attemptErr.message);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }

  // Feed mastery + spaced repetition with the EXACT graded fraction (partial marks matter).
  // First attempt only — re-attempts after the scheme was revealed earn nothing.
  const frac = q.marks > 0 ? marking.awarded / q.marks : 0;
  const gotIt = frac >= 0.5;
  let xp = 0;
  if (!isRepeat) {
    if (q.topic_id)
      await applyMasteryUpdate(supabase, user.id, {
        topic_id: q.topic_id,
        gotIt,
        q: frac,
        daysToExam,
        misconception: marking.misconception ?? undefined,
      });
    // XP scales with marks earned; a strong answer earns a bonus. Also credits the daily streak.
    xp = Math.round(marking.awarded * 2) + (gotIt ? 5 : 0);
    await recordActivity(supabase, user.id, xp);
  }

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
