"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Msg = { role: "user" | "assistant"; content: string };

export default function Session() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [capped, setCapped] = useState(false);
  const [usage, setUsage] = useState<{ used: number; cap: number } | null>(null);
  const [xpToast, setXpToast] = useState(0);
  const [subject, setSubject] = useState("");
  const [down, setDown] = useState(false);
  const [notified, setNotified] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const courseRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const param = new URLSearchParams(window.location.search).get("course");
      courseRef.current = param;
      if (param) {
        supabase
          .from("courses")
          .select("subject, emoji")
          .eq("id", param)
          .maybeSingle()
          .then(({ data }) => data && setSubject(`${data.emoji} ${data.subject}`));
      }
      send(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string | null) {
    if (streaming) return;
    if (text) setMessages((m) => [...m, { role: "user", content: text }]);
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        message: text,
        courseId: courseRef.current,
      }),
    });

    if (res.status === 402) {
      setCapped(true);
      setStreaming(false);
      setMessages((m) => m.slice(0, -1));
      return;
    }
    if (res.status === 400) {
      setStreaming(false);
      setMessages((m) => m.slice(0, -1));
      router.replace("/courses");
      return;
    }
    if (!res.ok || !res.body) {
      setStreaming(false);
      setMessages((m) => [
        ...m.slice(0, -1),
        { role: "assistant", content: "Something went wrong — try again." },
      ]);
      return;
    }

    sessionIdRef.current = res.headers.get("X-Session-Id");
    setUsage({
      used: Number(res.headers.get("X-Messages-Used") ?? 0),
      cap: Number(res.headers.get("X-Messages-Cap") ?? 25),
    });
    const xp = Number(res.headers.get("X-Xp-Earned") ?? 0);
    if (xp > 0) {
      setXpToast(xp);
      setTimeout(() => setXpToast(0), 2200);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      if (acc.includes("[[TEACHER_DOWN]]")) {
        setDown(true);
        setMessages((m) => m.slice(0, -1));
        setStreaming(false);
        return;
      }
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: acc }]);
    }
    setStreaming(false);
  }

  async function notifyDown() {
    setNotified(true);
    await fetch("/api/notify-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detail: subject }),
    }).catch(() => {});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    send(text);
  }

  return (
    <main className="flex flex-col min-h-screen max-w-md mx-auto w-full">
      <header className="px-5 pt-12 pb-3 flex justify-between items-center border-b border-[color:var(--line)] bg-[color:var(--paper)]/85 backdrop-blur-xl sticky top-0 z-20">
        <button onClick={() => router.push("/home")} className="text-[color:var(--ink-soft)] text-sm">
          ‹ Home
        </button>
        <p className="font-semibold text-sm truncate max-w-[55%]">{subject || "Lesson"}</p>
        {usage ? (
          <span className="text-[11px] text-[color:var(--ink-faint)]">
            {usage.used}/{usage.cap}
          </span>
        ) : (
          <span className="w-8" />
        )}
      </header>

      {xpToast > 0 && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 popin">
          <div
            className="rounded-full px-4 py-1.5 font-bold text-sm text-white"
            style={{ background: "var(--accent)" }}
          >
            +{xpToast} XP
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 flex flex-col gap-3 py-4 pb-40">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap max-w-[86%] ${
              m.role === "user"
                ? "self-end text-[color:var(--paper)] rounded-2xl rounded-br-md"
                : "self-start card rounded-2xl rounded-bl-md"
            }`}
            style={m.role === "user" ? { background: "var(--ink)" } : undefined}
          >
            {m.content || (
              <span className="inline-flex gap-1 py-1">
                {[0, 0.15, 0.3].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "var(--accent)", animationDelay: `${d}s` }}
                  />
                ))}
              </span>
            )}
          </div>
        ))}
        {capped && (
          <div className="card p-4 text-sm" style={{ borderColor: "var(--streak)" }}>
            <p className="font-semibold mb-1">That&apos;s your free lessons for today 🎉</p>
            <p className="text-[color:var(--ink-soft)]">
              Come back tomorrow to keep your streak — or upgrade for unlimited teaching
              (coming soon).
            </p>
          </div>
        )}
        {down && (
          <div className="card p-5 self-start max-w-[92%]" style={{ borderColor: "var(--streak)" }}>
            <p className="text-2xl mb-1">😴</p>
            <p className="font-semibold">Your teacher is taking a short break</p>
            <p className="text-[color:var(--ink-soft)] text-sm mt-1">
              They&apos;re briefly unavailable right now. Let us know and we&apos;ll get them
              back as fast as possible.
            </p>
            <button
              onClick={notifyDown}
              disabled={notified}
              className={`${notified ? "btn-ghost" : "btn"} w-full mt-3`}
            >
              {notified ? "✓ Thanks — we've been alerted" : "Let us know →"}
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="fixed bottom-14 inset-x-0 max-w-md mx-auto px-4 pb-3">
        <div className="flex gap-2 card p-1.5 items-center">
          <input
            className="flex-1 bg-transparent outline-none px-3 text-sm"
            placeholder={down ? "Teacher unavailable" : capped ? "See you tomorrow!" : "Type your answer…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={capped || streaming || down}
          />
          <button
            disabled={capped || streaming || down || !input.trim()}
            className="btn px-4 py-2.5 text-sm"
          >
            Send
          </button>
        </div>
      </form>
      <Nav />
    </main>
  );
}
