"use client";
import { useEffect, useState } from "react";

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Extracted so onboarding can fire the same opt-in at peak intent. Returns true on success,
// false on denial/unsupported/error — callers decide what to show.
export async function enablePush(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !("PushManager" in window)) return false;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    });
    const raw = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: { endpoint: raw.endpoint, keys: raw.keys } }),
    });
    return true;
  } catch {
    return false;
  }
}

export default function RemindersButton({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<"idle" | "on" | "busy" | "unsupported" | "denied">(
    enabled ? "on" : "idle"
  );

  useEffect(() => {
    if (typeof window !== "undefined" && !("PushManager" in window)) setState("unsupported");
  }, []);

  async function enable() {
    setState("busy");
    if (await enablePush()) return setState("on");
    setState(
      typeof Notification !== "undefined" && Notification.permission === "denied" ? "denied" : "idle"
    );
  }

  if (state === "on")
    return (
      <div className="card px-4 py-3 flex items-center gap-2 text-sm">
        <span>🔔</span>
        <span className="text-[color:var(--ink-soft)]">
          Study reminders are on — we&apos;ll nudge you at your study time.
        </span>
      </div>
    );
  if (state === "unsupported")
    return (
      <div className="card px-4 py-3 text-xs text-[color:var(--ink-faint)]">
        💡 Add this app to your home screen to turn on study reminders.
      </div>
    );

  return (
    <button
      onClick={enable}
      disabled={state === "busy"}
      className="btn-ghost w-full text-sm"
    >
      {state === "busy"
        ? "…"
        : state === "denied"
          ? "Enable notifications in settings to get reminders"
          : "🔔 Turn on study reminders"}
    </button>
  );
}
