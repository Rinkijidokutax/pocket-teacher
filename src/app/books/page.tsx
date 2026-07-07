"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Book = { id: string; title: string; author: string | null; kind: string; subject: string | null };
type Enr = { course_id: string; courses: { subject: string } | null };

const KIND_LABEL: Record<string, string> = { set_text: "Set text", textbook: "Textbook", other: "Book" };

export default function Books() {
  const router = useRouter();
  const [enr, setEnr] = useState<Enr[]>([]);
  const [curated, setCurated] = useState<Book[]>([]);
  const [mine, setMine] = useState<Book[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: e } = await supabase
        .from("enrollments")
        .select("course_id, courses(subject)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const en = (e ?? []) as unknown as Enr[];
      setEnr(en);
      const subjects = [...new Set(en.map((x) => x.courses?.subject).filter(Boolean))] as string[];
      if (subjects.length) {
        const { data: c } = await supabase
          .from("books")
          .select("id,title,author,kind,subject")
          .eq("is_template", true)
          .in("subject", subjects)
          .order("title");
        setCurated((c ?? []) as Book[]);
        setSubject(subjects[0]);
      }
      const { data: m } = await supabase
        .from("books")
        .select("id,title,author,kind,subject")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      setMine((m ?? []) as Book[]);
      setLoaded(true);
    })();
  }, [router]);

  function courseFor(bookSubject: string | null): string | null {
    const match = enr.find((x) => x.courses?.subject === bookSubject);
    return (match ?? enr[0])?.course_id ?? null;
  }
  function open(b: Book) {
    const c = courseFor(b.subject);
    router.push(`/session?book=${b.id}${c ? `&course=${c}` : ""}`);
  }
  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/books/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author, subject }),
      });
      const out = await res.json().catch(() => ({}));
      if (out.bookId) {
        const c = courseFor(subject);
        router.push(`/session?book=${out.bookId}${c ? `&course=${c}` : ""}`);
      } else setErr("Couldn’t add that book — try again.");
    } catch {
      setErr("Couldn’t add that book — try again.");
    } finally {
      setBusy(false);
    }
  }

  const subjects = [...new Set(enr.map((x) => x.courses?.subject).filter(Boolean))] as string[];

  const Row = (b: Book) => (
    <button
      key={b.id}
      onClick={() => open(b)}
      className="card px-4 py-3 flex items-center gap-3 text-left w-full"
    >
      <span className="text-xl">📖</span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-sm truncate">{b.title}</span>
        <span className="block text-xs text-[color:var(--ink-faint)] truncate">
          {b.author ? `${b.author} · ` : ""}
          {b.subject ?? ""} {b.subject ? "·" : ""} {KIND_LABEL[b.kind] ?? "Book"}
        </span>
      </span>
      <span className="text-[color:var(--ink-faint)]">→</span>
    </button>
  );

  return (
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <div className="rise">
        <h1 className="display text-3xl font-semibold">Books</h1>
        <p className="text-sm text-[color:var(--ink-soft)] mt-1">
          Pick a set text or textbook and learn it by chatting with your teacher about it.
        </p>
      </div>

      {!loaded ? (
        <p className="text-[color:var(--ink-faint)] animate-pulse rise">Loading…</p>
      ) : enr.length === 0 ? (
        <div className="card p-6 text-center text-[color:var(--ink-soft)]">
          Add a subject first, then pick books for it.
        </div>
      ) : (
        <>
          {curated.length > 0 && (
            <section className="rise d1">
              <p className="eyebrow mb-2">For your subjects</p>
              <div className="flex flex-col gap-2">{curated.map(Row)}</div>
            </section>
          )}

          {mine.length > 0 && (
            <section className="rise d1">
              <p className="eyebrow mb-2">Your books</p>
              <div className="flex flex-col gap-2">{mine.map(Row)}</div>
            </section>
          )}

          <section className="card p-4 rise d2 flex flex-col gap-2.5">
            <p className="eyebrow">Add any book</p>
            <input
              className="input"
              placeholder="Book title (e.g. Things Fall Apart)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              className="input"
              placeholder="Author (optional)"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button onClick={add} disabled={busy || !title.trim()} className="btn">
              {busy ? "Setting up the book…" : "Add & start learning →"}
            </button>
            {err && (
              <p className="text-sm rise" style={{ color: "var(--streak-text)" }}>
                {err}
              </p>
            )}
          </section>
        </>
      )}
      <Nav />
    </main>
  );
}
