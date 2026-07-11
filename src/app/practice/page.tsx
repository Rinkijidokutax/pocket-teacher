"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Course = { course_id: string; courses: { subject: string; emoji: string } | null };
type Question = {
  id: string;
  question_md: string;
  marks: number;
  command_word: string | null;
  type: string;
  difficulty: string;
};
type Result = {
  awarded: number;
  max: number;
  perPoint: { point: string; earned: boolean; note: string }[];
  feedback: string;
  misconception?: string | null;
  modelAnswer?: string | null;
  markScheme: { point: string; marks: number; keywords?: string[] }[];
  xp: number;
};

const DIFFS = ["Adaptive", "Easy", "Medium", "Hard"] as const;
type Diff = (typeof DIFFS)[number];

export default function Practice() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [active, setActive] = useState<string>("");
  const [topic, setTopic] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff>("Adaptive");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingQ, setLoadingQ] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [marking, setMarking] = useState(false);
  const [err, setErr] = useState("");
  const [xpToast, setXpToast] = useState(0);

  async function load(courseId: string, topicId: string | null, difficulty: Diff) {
    setLoadingQ(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ courseId });
      if (topicId) qs.set("topicId", topicId);
      if (difficulty !== "Adaptive") qs.set("difficulty", difficulty.toLowerCase());
      const res = await fetch(`/api/questions?${qs.toString()}`);
      const out = await res.json().catch(() => ({}));
      setQuestions((out.questions ?? []) as Question[]);
      setI(0);
      setAnswer("");
      setResult(null);
    } catch {
      // offline/drop: show the error, don't leave the previous course's deck on screen
      setQuestions([]);
      setErr("Couldn’t load questions — check your connection.");
    } finally {
      setLoadingQ(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const params = new URLSearchParams(window.location.search);
      const c = params.get("course");
      const t = params.get("topic");
      setTopic(t);
      const { data: e } = await supabase
        .from("enrollments")
        .select("course_id, courses(subject, emoji)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const en = (e ?? []) as unknown as Course[];
      setCourses(en);
      setActive(c ?? en[0]?.course_id ?? "");
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload the deck whenever the active course, topic filter or difficulty changes.
  useEffect(() => {
    if (!active) return;
    load(active, topic, diff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, diff, topic]);

  async function generate() {
    if (!active) return;
    setGenerating(true);
    setErr("");
    try {
      const res = await fetch("/api/questions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: active,
          topicId: topic ?? undefined,
          difficulty: diff === "Adaptive" ? undefined : diff.toLowerCase(),
        }),
      });
      if (res.ok) await load(active, topic, diff);
      else setErr("Couldn’t write questions just now — give it another tap.");
    } catch {
      setErr("Couldn’t write questions just now — give it another tap.");
    } finally {
      setGenerating(false);
    }
  }

  async function submit() {
    const q = questions[i];
    if (!q || !answer.trim()) return;
    setMarking(true);
    setErr("");
    try {
      const res = await fetch("/api/questions/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: q.id, answer }),
      });
      const out = res.ok ? ((await res.json()) as Result) : null;
      if (out) {
        setResult(out);
        if (out.xp > 0) {
          setXpToast(out.xp);
          setTimeout(() => setXpToast(0), 2200);
        }
      } else {
        setErr("Couldn’t mark that — check your connection and try again.");
      }
    } catch {
      setErr("Couldn’t mark that — check your connection and try again.");
    } finally {
      setMarking(false);
    }
  }

  function next() {
    setI((n) => n + 1);
    setAnswer("");
    setResult(null);
  }

  const q = questions[i];
  const atEnd = loaded && !loadingQ && active && questions.length > 0 && i >= questions.length;

  return (
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <h1 className="display text-3xl font-semibold rise">Exam practice</h1>
      <p className="text-sm text-[color:var(--ink-soft)] rise -mt-3">
        Write real exam answers — marked point-by-point by AI.
      </p>

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

      {!loaded ? (
        <p className="text-[color:var(--ink-faint)] animate-pulse rise">Loading…</p>
      ) : courses.length === 0 ? (
        <div className="card p-6 text-center text-[color:var(--ink-soft)]">
          Add a subject first to start revising.
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 rise d1">
            {courses.map((c) => (
              <button
                key={c.course_id}
                // The ?topic= filter belongs to the course the task linked to — clear it when
                // switching subjects or every other course shows an empty/foreign deck.
                onClick={() => { setActive(c.course_id); setTopic(null); }}
                className={`chip whitespace-nowrap min-h-11 ${active === c.course_id ? "chip-on" : ""}`}
              >
                {c.courses?.emoji} {c.courses?.subject}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 rise d1">
            {DIFFS.map((d) => (
              <button
                key={d}
                onClick={() => setDiff(d)}
                className={`chip whitespace-nowrap min-h-11 ${diff === d ? "chip-on" : ""}`}
              >
                {d}
              </button>
            ))}
          </div>

          {loadingQ ? (
            <p className="text-[color:var(--ink-faint)] animate-pulse rise">Loading questions…</p>
          ) : questions.length === 0 || atEnd ? (
            <div className="card p-6 flex flex-col items-center gap-4 text-center rise">
              <p className="text-4xl">✍</p>
              <p className="display text-xl font-semibold">
                {atEnd ? "You’ve practised all loaded questions" : "No questions yet"}
              </p>
              <p className="text-sm text-[color:var(--ink-soft)] max-w-xs">
                {atEnd
                  ? "Generate more to keep going."
                  : "Generate a fresh set of exam-style questions to practise."}
              </p>
              <button onClick={generate} disabled={generating} className="btn">
                {generating ? "Writing exam questions…" : "Generate questions"}
              </button>
            </div>
          ) : q ? (
            <div className="card p-5 flex flex-col gap-4 rise">
              <div className="flex items-center gap-2 flex-wrap">
                {q.command_word && <span className="chip">{q.command_word}</span>}
                <span className="chip chip-on">
                  {q.marks} mark{q.marks === 1 ? "" : "s"}
                </span>
                <span className="text-[11px] text-[color:var(--ink-faint)] ml-auto">
                  {i + 1}/{questions.length}
                </span>
              </div>

              <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.question_md}</p>

              {!result ? (
                <>
                  <textarea
                    rows={4}
                    className="input resize-none"
                    placeholder="Write your answer…"
                    value={answer}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                  />
                  <button
                    onClick={submit}
                    disabled={marking || !answer.trim()}
                    className="btn"
                  >
                    {marking ? "Marking…" : "Submit answer"}
                  </button>
                </>
              ) : (
                <>
                  <p className="display text-3xl font-semibold text-center" style={{ color: "var(--accent)" }}>
                    {result.awarded} / {result.max} marks
                  </p>

                  <div className="flex flex-col gap-2">
                    {result.perPoint.map((p, k) => (
                      <div key={k} className="flex gap-2 text-sm">
                        <span style={{ color: p.earned ? "var(--accent)" : "var(--streak-text)" }}>
                          {p.earned ? "✓" : "✗"}
                        </span>
                        <span className="flex-1">
                          {p.point}
                          {p.note && (
                            <span className="text-[color:var(--ink-faint)]"> — {p.note}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  {result.feedback && (
                    <div>
                      <p className="eyebrow mb-1">Examiner feedback</p>
                      <p className="text-sm text-[color:var(--ink-soft)] leading-relaxed whitespace-pre-wrap">
                        {result.feedback}
                      </p>
                    </div>
                  )}

                  {result.markScheme?.length > 0 && (
                    <div>
                      <p className="eyebrow mb-1">Mark scheme</p>
                      <ul className="flex flex-col gap-1">
                        {result.markScheme.map((m, k) => (
                          <li key={k} className="text-sm text-[color:var(--ink-soft)]">
                            {m.point} — {m.marks} mark{m.marks === 1 ? "" : "s"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.modelAnswer && (
                    <div>
                      <p className="eyebrow mb-1">Model answer</p>
                      <p className="text-sm text-[color:var(--ink-soft)] leading-relaxed whitespace-pre-wrap">
                        {result.modelAnswer}
                      </p>
                    </div>
                  )}

                  <button onClick={next} className="btn-accent">
                    Next question →
                  </button>
                </>
              )}
            </div>
          ) : null}

          {err && (
            <p className="text-sm rise" style={{ color: "var(--streak-text)" }}>
              {err}
            </p>
          )}
        </>
      )}
      <Nav />
    </main>
  );
}
