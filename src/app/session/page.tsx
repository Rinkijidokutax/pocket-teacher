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
  const sessionIdRef = useRef<string | null>(null);
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
      send(null); // kick off the session — tutor greets and starts the agenda
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
      body: JSON.stringify({ sessionId: sessionIdRef.current, message: text }),
    });

    if (res.status === 402) {
      setCapped(true);
      setStreaming(false);
      setMessages((m) => m.slice(0, -1));
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
    const used = Number(res.headers.get("X-Messages-Used") ?? 0);
    const cap = Number(res.headers.get("X-Messages-Cap") ?? 25);
    setUsage({ used, cap });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      const current = acc;
      setMessages((m) => [
        ...m.slice(0, -1),
        { role: "assistant", content: current },
      ]);
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
      <header className="px-6 pt-10 pb-3 flex justify-between items-end">
        <h1 className="text-lg font-bold">Today&apos;s lesson 📖</h1>
        {usage && (
          <span className="text-xs text-slate-500">
            {usage.used}/{usage.cap} today
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-3 pb-40">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-w-[85%] ${
              m.role === "user"
                ? "bg-violet-600 self-end"
                : "bg-white/8 border border-white/10 self-start"
            }`}
          >
            {m.content || (
              <span className="inline-block animate-pulse text-slate-400">
                thinking…
              </span>
            )}
          </div>
        ))}
        {capped && (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-400/30 px-4 py-4 text-sm text-amber-200">
            You&apos;ve used today&apos;s free lessons 🎉 Come back tomorrow — or
            upgrade for unlimited teaching (coming soon).
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={submit}
        className="fixed bottom-14 inset-x-0 max-w-md mx-auto px-4 pb-3"
      >
        <div className="flex gap-2 bg-[#151228] border border-white/10 rounded-2xl p-2">
          <input
            className="flex-1 bg-transparent outline-none px-3 text-sm"
            placeholder={capped ? "See you tomorrow!" : "Type your answer…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={capped || streaming}
          />
          <button
            disabled={capped || streaming || !input.trim()}
            className="bg-violet-600 disabled:opacity-40 rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Send
          </button>
        </div>
      </form>
      <Nav />
    </main>
  );
}
