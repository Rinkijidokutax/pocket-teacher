"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Card = { id: string; front: string; back: string; interval_days: number; reps: number };

export default function Flashcards() {
  const router = useRouter();
  const [course, setCourse] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  async function load(courseId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("flashcards")
      .select("id, front, back, interval_days, reps")
      .eq("course_id", courseId)
      .lte("review_due", today)
      .order("review_due")
      .limit(20);
    setCards((data ?? []) as Card[]);
    setI(0);
    setFlipped(false);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const c = new URLSearchParams(window.location.search).get("course");
      setCourse(c);
      if (c) load(c);
      else setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    if (!course) return;
    setBusy(true);
    await fetch("/api/flashcards/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: course }),
    });
    await load(course);
    setBusy(false);
  }

  async function rate(gotIt: boolean) {
    const card = cards[i];
    const interval = gotIt ? Math.min(Math.round(card.interval_days * 2.2) || 1, 60) : 1;
    const due = new Date(Date.now() + interval * 86400000).toISOString().slice(0, 10);
    await supabase
      .from("flashcards")
      .update({ interval_days: interval, reps: gotIt ? card.reps + 1 : 0, review_due: due })
      .eq("id", card.id);
    setDoneCount((d) => d + 1);
    if (i + 1 < cards.length) {
      setI(i + 1);
      setFlipped(false);
    } else {
      setCards([]);
    }
  }

  if (loading)
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[color:var(--ink-faint)] animate-pulse">Loading…</p>
      </main>
    );

  const card = cards[i];

  return (
    <main className="flex flex-col min-h-screen max-w-md mx-auto w-full px-6 pt-14 pb-28">
      <header className="flex items-center justify-between mb-6">
        <button onClick={() => router.push("/study")} className="text-[color:var(--ink-soft)] text-sm">
          ‹ Study
        </button>
        <p className="eyebrow">Flashcards</p>
        <span className="text-[11px] text-[color:var(--ink-faint)]">
          {cards.length ? `${i + 1}/${cards.length}` : ""}
        </span>
      </header>

      {!card ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">{doneCount > 0 ? "🎉" : "▤"}</p>
          <p className="display text-2xl font-semibold">
            {doneCount > 0 ? "Reviewed! Nice work." : "No cards due"}
          </p>
          <p className="text-sm text-[color:var(--ink-soft)] max-w-xs">
            {doneCount > 0
              ? "They'll come back for review right when you're about to forget them."
              : "Generate a fresh set from your weakest topic."}
          </p>
          <button onClick={generate} disabled={busy || !course} className="btn mt-2">
            {busy ? "Making cards…" : "Generate flashcards"}
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="card flex-1 min-h-[320px] flex items-center justify-center text-center p-8 transition"
          >
            <div>
              <p className="eyebrow mb-3">{flipped ? "Answer" : "Question"}</p>
              <p className={`${flipped ? "text-lg" : "display text-2xl font-semibold"} leading-snug`}>
                {flipped ? card.back : card.front}
              </p>
              {!flipped && <p className="text-xs text-[color:var(--ink-faint)] mt-6">tap to flip</p>}
            </div>
          </button>
          {flipped && (
            <div className="flex gap-3 mt-4">
              <button onClick={() => rate(false)} className="btn-ghost flex-1">
                Again
              </button>
              <button onClick={() => rate(true)} className="btn-accent flex-1">
                Got it
              </button>
            </div>
          )}
        </>
      )}
      <Nav />
    </main>
  );
}
