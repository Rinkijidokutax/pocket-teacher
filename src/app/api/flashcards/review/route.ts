import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/activity";

// Record a flashcard review: advance its spaced-repetition schedule and credit the daily
// streak + a little XP (active recall counts toward the habit, like chat and quizzes).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { cardId, gotIt } = (await req.json()) as { cardId: string; gotIt: boolean };
  const { data: card } = await supabase
    .from("flashcards")
    .select("interval_days, reps")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!card) return Response.json({ error: "not_found" }, { status: 404 });

  // SM-2-ish: grow the interval on a hit, reset to 1 day on a miss.
  const interval = gotIt ? Math.min(Math.round(card.interval_days * 2.2) || 1, 60) : 1;
  const review_due = new Date(Date.now() + interval * 86400000).toISOString().slice(0, 10);
  // If this reschedule write is swallowed, the card stays "due" forever and the student
  // re-reviews it endlessly — fail loudly so the client's existing retry path fires.
  const { error: updErr } = await supabase
    .from("flashcards")
    .update({ interval_days: interval, reps: gotIt ? card.reps + 1 : 0, review_due })
    .eq("id", cardId)
    .eq("user_id", user.id);
  if (updErr) {
    console.error("flashcard review update failed:", updErr.message);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }

  const { streak } = await recordActivity(supabase, user.id, gotIt ? 2 : 0);
  return Response.json({ ok: true, streak });
}
