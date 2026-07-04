import type { SupabaseClient } from "@supabase/supabase-js";

const today = () => new Date().toISOString().slice(0, 10);

// Credit a study activity: bump the daily streak (once per day) and add XP. Used by every
// activity that should count toward a student's habit — not just the tutor chat. Returns the
// new streak + total XP for optional UI feedback.
export async function recordActivity(
  supabase: SupabaseClient,
  userId: string,
  xp = 0
): Promise<{ streak: number; xp: number }> {
  const { data: p } = await supabase
    .from("profiles")
    .select("streak, last_study_date, xp")
    .eq("id", userId)
    .single();
  const streakPrev = p?.streak ?? 0;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak =
    p?.last_study_date === today()
      ? streakPrev
      : p?.last_study_date === yesterday
        ? streakPrev + 1
        : 1;
  const newXp = (p?.xp ?? 0) + xp;
  await supabase
    .from("profiles")
    .update({ streak, last_study_date: today(), xp: newXp })
    .eq("id", userId);
  return { streak, xp: newXp };
}
