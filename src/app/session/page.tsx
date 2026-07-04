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
      const current = acc;
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: current }]);
    }
    setStreaming(false);
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
      <header className="px-5 pt-11 pb-3 flex justify-between items-center border-b border-white/5">
        <button onClick={() => router.push("/home")} className="text-slate-400 text-sm">
          ‹ Home
        </button>
        <p className="text-sm font-bold truncate max-w-[55%]">{subject || "Lesson"}</p>
        {usage ? (
          <span className="text-[11px] text-slate-500">{usage.used}/{usage.cap}</span>
        ) : (
          <span className="w-8" />
        )}
      </header>

      {xpToast > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 pop">
          <div className="rounded-full px-5 py-2 font-black text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-lg">
            ⚡ +{xpToast} XP
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 flex flex-col gap-3 py-4 pb-40">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-3xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-w-[86%] ${
              m.role === "user"
                ? "self-end text-white"
                : "self-start card"
            }`}
            style={
              m.role === "user"
                ? { background: "linear-gradient(135deg,#7c3aed,#d946ef)" }
                : undefined
            }
          >
            {m.content || (
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300 animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300 animate-bounce [animation-delay:0.3s]" />
              </span>
            )}
          </div>
        ))}
        {capped && (
          <div className="card p-4 text-sm text-amber-200 border-amber-400/30">
            🎉 That&apos;s all your free lessons for today! Come back tomorrow to keep
            your streak — or upgrade for unlimited teaching (coming soon).
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={submit}
        className="fixed bottom-14 inset-x-0 max-w-md mx-auto px-4 pb-3"
      >
        <div className="flex gap-2 card p-2">
          <input
            className="flex-1 bg-transparent outline-none px-3 text-sm"
            placeholder={capped ? "See you tomorrow!" : "Type your answer…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={capped || streaming}
          />
          <button
            disabled={capped || streaming || !input.trim()}
            className="btn px-5 py-2.5 text-sm rounded-xl"
          >
            Send
          </button>
        </div>
      </form>
      <Nav />
    </main>
  );
}
