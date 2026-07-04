import { createClient } from "@/lib/supabase/server";

// Save a browser push subscription so we can send study reminders.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { subscription } = (await req.json()) as {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  };
  if (!subscription?.endpoint)
    return Response.json({ error: "bad_subscription" }, { status: 400 });

  const { data: prof } = await supabase
    .from("profiles")
    .select("survey")
    .eq("id", user.id)
    .maybeSingle();
  const study_time = (prof?.survey as { study_time?: string } | null)?.study_time ?? "evening";

  await supabase.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    study_time,
  });
  await supabase.from("profiles").update({ reminders: true }).eq("id", user.id);

  return Response.json({ ok: true });
}
