import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

// Vercel Cron hits this hourly. Sends a study reminder to each student at their
// chosen time of day (from the questionnaire). Node runtime (web-push needs crypto).
export const dynamic = "force-dynamic";

// Loss-framed, personalized copy — a targeted streak-save converts far better than a
// generic blast. Precedence: win-back a lapsed student first, then protect a live streak,
// then surface due work, then a gentle default.
function nudgeBody(streak: number, due: number, daysSince: number | null): string {
  if (daysSince !== null && daysSince >= 3)
    return "Your subjects miss you — pick up where you left off 👋";
  if (streak >= 2) return `🔥 Your ${streak}-day streak ends tonight — one quick review saves it`;
  if (due > 0)
    return `${due} topic${due === 1 ? "" : "s"} ready for review — 5 minutes keeps you on track`;
  return "A few minutes today keeps your momentum going 📚";
}

type DueSub = {
  endpoint: string;
  p256dh: string;
  auth: string;
  name: string | null;
  // Added by the enhanced due_reminders RPC (see report — migration required). Optional so
  // the route degrades safely to the gentle default until that migration is applied.
  streak?: number | null;
  last_study_date?: string | null;
  due?: number | null;
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY)
    return Response.json({ error: "no_vapid" }, { status: 500 });

  // Hobby plan allows one daily cron, so we remind everyone in a single run.
  // (On Pro, switch vercel.json to hourly and pass the current bucket here for
  // per-time-of-day reminders — the function already supports specific buckets.)
  const bucket = "all";
  const today = new Date().toISOString().slice(0, 10); // UTC — matches record_activity / home

  // RLS blocks direct table reads here (cron has no user session), so recipients come from
  // the security-definer due_reminders RPC. The CRON_SECRET gate stays fail-closed via p_secret.
  const supabase = await createClient();
  const { data: subs } = await supabase.rpc("due_reminders", {
    p_secret: process.env.CRON_SECRET ?? "",
    p_bucket: bucket,
  });
  if (!subs?.length) return Response.json({ ok: true, sent: 0, bucket });

  webpush.setVapidDetails(
    "mailto:dorasawmymiguel@gmail.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  let sent = 0;
  let skipped = 0;
  await Promise.allSettled(
    (subs as DueSub[]).map(async (s) => {
      // Already studied today — don't nag them.
      if (s.last_study_date === today) {
        skipped++;
        return;
      }
      const streak = s.streak ?? 0;
      const due = s.due ?? 0;
      const daysSince = s.last_study_date
        ? Math.floor((Date.parse(today) - Date.parse(s.last_study_date)) / 86400000)
        : null;
      const payload = JSON.stringify({
        title: `Pocket Teacher${s.name ? `, ${s.name.split(" ")[0]}` : ""}`,
        body: nudgeBody(streak, due, daysSince),
        url: "/home", // deep-link target (sw.js currently hardcodes /home — see report)
      });
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch {
        // expired/invalid subscription — ignore (cleaned up on next resubscribe)
      }
    })
  );

  return Response.json({ ok: true, sent, skipped, bucket });
}
