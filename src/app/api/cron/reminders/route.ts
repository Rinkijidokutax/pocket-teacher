import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

// Vercel Cron hits this hourly. Sends a study reminder to each student at their
// chosen time of day (from the questionnaire). Node runtime (web-push needs crypto).
export const dynamic = "force-dynamic";

const BUCKET_HOUR: Record<string, number> = {
  morning: 8,
  afternoon: 14,
  evening: 18,
  night: 21,
};

const NUDGES = [
  "Time for today's lesson 📚 keep your streak alive!",
  "Your teacher is ready — 10 minutes today goes a long way ✏️",
  "Quick study session? Your exam will thank you 🎯",
  "Let's chip away at your weak spots today 💪",
];

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY)
    return Response.json({ error: "no_vapid" }, { status: 500 });

  // which time-of-day bucket is it right now in Mauritius (UTC+4, no DST)?
  const mauritiusHour = (new Date().getUTCHours() + 4) % 24;
  const bucket = Object.entries(BUCKET_HOUR).find(([, h]) => h === mauritiusHour)?.[0];
  if (!bucket) return Response.json({ ok: true, sent: 0, note: "no bucket this hour" });

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
  await Promise.allSettled(
    (subs as { endpoint: string; p256dh: string; auth: string; name: string | null }[]).map(
      async (s) => {
        const payload = JSON.stringify({
          title: `Pocket Teacher${s.name ? `, ${s.name.split(" ")[0]}` : ""}`,
          body: NUDGES[Math.floor(mauritiusHour) % NUDGES.length],
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
      }
    )
  );

  return Response.json({ ok: true, sent, bucket });
}
