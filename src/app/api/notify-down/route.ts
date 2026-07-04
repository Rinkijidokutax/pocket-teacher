import { createClient } from "@/lib/supabase/server";

// Raised by the "Notify Miguel" button when the teacher is unavailable.
// Records an alert row + fires an instant push (ntfy, zero-config) + optional email.
const NTFY_TOPIC = process.env.NTFY_TOPIC || "pocketteacher-alerts-mig4f7a";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "dorasawmymiguel@gmail.com";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Require auth — otherwise this is a public endpoint that spams the admin with pushes.
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { detail } = (await req.json().catch(() => ({}))) as { detail?: string };
  const msg = `Pocket Teacher is DOWN — a student couldn't reach the teacher${
    detail ? ` (${detail})` : ""
  }. Likely the AI service is out of credits: openrouter.ai/settings/credits`;

  // 1) durable record
  await supabase.from("alerts").insert({
    user_id: user.id,
    kind: "teacher_down",
    detail: detail ?? null,
  });

  // 2) instant push — ntfy.sh needs no account; Miguel subscribes to the topic
  const jobs: Promise<unknown>[] = [
    fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      // HTTP header values must be ASCII — keep the emoji in the body only
      headers: { Title: "Pocket Teacher down", Priority: "high", Tags: "warning" },
      body: msg,
    }).catch(() => null),
  ];

  // 3) optional email if a Resend key is configured
  if (process.env.RESEND_API_KEY) {
    jobs.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "Pocket Teacher <onboarding@resend.dev>",
          to: ADMIN_EMAIL,
          subject: "⚠️ Pocket Teacher is down",
          text: msg,
        }),
      }).catch(() => null)
    );
  }

  await Promise.allSettled(jobs);
  return Response.json({ ok: true });
}
