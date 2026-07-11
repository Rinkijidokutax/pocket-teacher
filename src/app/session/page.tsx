"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Msg = { role: "user" | "assistant"; content: string };

// Free models emit markdown despite instructions, and occasionally editorialise about the
// silent mastery marker. Strip both so students see clean, plain text (the design uses no
// markdown). Applied at render, so it also cleans partial text mid-stream.
// Resize/compress a camera photo before upload — students on slow mobile networks
// shouldn't wait to push a 4MB snapshot when ~300KB reads just as well for OCR.
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.7));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function clean(t: string): string {
  // NOTE: no lookbehind regexes here — they fail to PARSE on Safari/iOS < 16.4 and would
  // crash the whole session page on older iPhones (common among students).
  return t
    .replace(/\*?\(\s*(?:note|nb)[^)]*mastery[^)]*\)\*?/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^\w*])\*(\S(?:[^*\n]*?\S)?)\*(?![\w*])/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .trimEnd();
}

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
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const courseRef = useRef<string | null>(null);
  const bookRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef(true); // stick to bottom only while the student is already there

  useEffect(() => {
    if (pinRef.current) bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const params = new URLSearchParams(window.location.search);
      const param = params.get("course");
      const topicParam = params.get("topic");
      const bookParam = params.get("book");
      courseRef.current = param;
      bookRef.current = bookParam;
      if (bookParam) {
        const { data: b } = await supabase
          .from("books")
          .select("title")
          .eq("id", bookParam)
          .maybeSingle();
        if (b) setSubject(`📖 ${b.title}`);
      } else if (param) {
        supabase
          .from("courses")
          .select("subject, emoji")
          .eq("id", param)
          .maybeSingle()
          .then(({ data }) => data && setSubject(`${data.emoji} ${data.subject}`));
      }
      // Launched from a scheduled "revise <topic>" task — open the lesson on that topic.
      if (topicParam) {
        const { data: t } = await supabase
          .from("topics")
          .select("name")
          .eq("id", topicParam)
          .maybeSingle();
        send(t?.name ? `Let's revise ${t.name}.` : null);
      } else {
        send(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string | null) {
    if (streaming) return;
    if (text) {
      pinRef.current = true; // a fresh student message always snaps to the bottom
      setMessages((m) => [...m, { role: "user", content: text }]);
    }
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          message: text,
          courseId: courseRef.current,
          bookId: bookRef.current,
        }),
      });
    } catch {
      // network error before any response — never leave the typing dots spinning
      setStreaming(false);
      setMessages((m) => [
        ...m.slice(0, -1),
        { role: "assistant", content: "Connection hiccup — send your message again." },
      ]);
      return;
    }

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

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    let xpShown = false;
    try {
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
        // XP arrives as a trailing [[XP:n]] marker (headers are sent before it's known)
        const xpm = acc.match(/\[\[XP:(\d+)\]\]/);
        if (xpm && !xpShown) {
          xpShown = true;
          const n = Number(xpm[1]);
          if (n > 0) {
            setXpToast(n);
            setTimeout(() => setXpToast(0), 2200);
          }
        }
        const display = acc.replace(/\[\[XP:\d+\]\]/g, "").replace(/\[\[XP:\d*$/, "");
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: display }]);
      }
    } catch {
      // stream broke mid-answer — keep what we have rather than locking the UI
    }
    setStreaming(false);
    // A turn that streamed only markers (no visible text) would otherwise leave the empty
    // placeholder bubble stuck on typing dots forever — drop it.
    setMessages((m) => {
      const last = m[m.length - 1];
      return last && last.role === "assistant" && !clean(last.content).trim()
        ? m.slice(0, -1)
        : m;
    });
  }

  async function notifyDown() {
    setNotified(true);
    await fetch("/api/notify-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detail: subject }),
    }).catch(() => {});
  }

  // Snap a problem: photo -> read it -> send it to the tutor to solve in-flow.
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw || photoBusy || streaming) return;
    setPhotoBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const file = await compressImage(raw);
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("materials").upload(path, file);
      if (upErr) throw upErr;
      const { data: mat } = await supabase
        .from("materials")
        .insert({ user_id: user.id, kind: "image", filename: file.name, storage_path: path })
        .select("id")
        .single();
      if (!mat) throw new Error("save failed");
      await fetch("/api/materials/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId: mat.id }),
      });
      const { data: m2 } = await supabase
        .from("materials")
        .select("extracted_text, status")
        .eq("id", mat.id)
        .single();
      setPhotoBusy(false);
      if (m2?.status === "ready" && m2.extracted_text) {
        send(`I took a photo of a problem I'm stuck on:\n\n${m2.extracted_text}\n\nCan you help me solve it step by step?`);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "I couldn't read that photo clearly — try typing the question and I'll help." },
        ]);
      }
    } catch {
      setPhotoBusy(false);
    }
    if (photoRef.current) photoRef.current.value = "";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    send(text);
  }

  return (
    <main className="flex flex-col min-h-screen max-w-md mx-auto w-full">
      <header className="px-5 pt-[calc(env(safe-area-inset-top)+3rem)] pb-3 flex justify-between items-center border-b border-[color:var(--line)] bg-[color:var(--paper)]/85 backdrop-blur-xl sticky top-0 z-20">
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

      <div
        role="log"
        aria-live="polite"
        aria-atomic="false"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
        }}
        className="flex-1 overflow-y-auto no-scrollbar px-4 flex flex-col gap-3 py-4 pb-[calc(13rem+env(safe-area-inset-bottom))]"
      >
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
            {m.content ? (
              clean(m.content)
            ) : (
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
          <div className="card p-5 text-sm" style={{ borderColor: "var(--streak)" }}>
            <p className="font-semibold mb-1">That&apos;s your free lessons for today 🎉</p>
            <p className="text-[color:var(--ink-soft)]">
              Come back tomorrow to keep your streak — or go Premium for unlimited teaching.
            </p>
            <button onClick={() => router.push("/upgrade")} className="btn-accent w-full mt-3">
              Go Premium →
            </button>
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

      <form onSubmit={submit} className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] inset-x-0 max-w-md mx-auto px-4 pb-3">
        <div className="flex gap-2 card p-1.5 items-end">
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhoto}
            className="hidden"
            id="snap"
          />
          <label
            htmlFor="snap"
            title="Snap a problem"
            aria-label="Snap a photo of a problem"
            className={`text-xl cursor-pointer select-none min-w-11 min-h-11 flex items-center justify-center ${
              capped || streaming || down || photoBusy ? "opacity-40 pointer-events-none" : ""
            }`}
          >
            {photoBusy ? "⏳" : "📷"}
          </label>
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 bg-transparent outline-none px-1 py-2 text-sm resize-none max-h-32 leading-relaxed"
            placeholder={
              photoBusy
                ? "Reading your photo…"
                : down
                  ? "Teacher unavailable"
                  : capped
                    ? "See you tomorrow!"
                    : "Type your answer… (Enter for a new line)"
            }
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
            }}
            onKeyDown={(e) => {
              // Enter adds a new line (essay answers); ⌘/Ctrl+Enter sends.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                const text = input.trim();
                if (text) {
                  setInput("");
                  e.currentTarget.style.height = "auto";
                  send(text);
                }
              }
            }}
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
