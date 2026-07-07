import type { SupabaseClient } from "@supabase/supabase-js";

// Credit a study activity: bump the daily streak (once per day) and add XP. Used by every
// activity that should count toward a student's habit — not just the tutor chat. The whole
// update is done atomically in the DB (public.record_activity, SECURITY DEFINER on auth.uid())
// so two concurrent activities can't lose XP or miscount the streak via read-then-write.
// Returns the new streak + total XP for optional UI feedback.
export async function recordActivity(
  supabase: SupabaseClient,
  _userId: string,
  xp = 0
): Promise<{ streak: number; xp: number }> {
  const { data } = await supabase.rpc("record_activity", { p_xp: xp });
  const row = Array.isArray(data) ? data[0] : data;
  return { streak: row?.streak ?? 0, xp: row?.xp ?? 0 };
}
