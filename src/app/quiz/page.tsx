"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Q = { q: string; options: string[] };
type Result = {
  score: number;
  total: number;
  correctAnswers: number[];
  xp: number;
  explanations?: (string | null)[];
};

export default function Quiz() {
  const router = useRouter();
  const [course, setCourse] = useState<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function generate(courseId: string, topicId?: string, materialId?: string) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, topicId, materialId }),
      });
      const out = await res.json().catch(() => ({}));
      if (out.quizId) {
        setQuizId(out.quizId);
        setTitle(out.title ?? "");
        setQuestions(out.questions ?? []);
        setAnswers(new Array((out.questions ?? []).length).fill(-1));
      }
    } finally {
      setLoading(false); // never strand the student on 'Writing your quiz…'
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const params = new URLSearchParams(window.location.search);
      const c = params.get("course");
      const t = params.get("topic");
      const mat = params.get("material");
      setCourse(c);
      if (c) generate(c, t ?? undefined, mat ?? undefined);
      else setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, answers }),
      });
      const out = res.ok ? ((await res.json()) as Result) : null;
      if (out) setResult(out);
      else alert("Couldn’t mark the quiz — check your connection and try again.");
    } catch {
      alert("Couldn’t mark the quiz — check your connection and try again.");
    } finally {
      setSubmitting(false); // never strand the student on 'Marking…'
    }
  }

  if (loading)
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-3xl animate-pulse">◎</p>
        <p className="text-[color:var(--ink-soft)]">Writing your quiz…</p>
      </main>
    );

  return (
    <main className="flex flex-col min-h-screen max-w-md mx-auto w-full px-6 pt-14 pb-28">
      <header className="flex items-center justify-between mb-4">
        <button onClick={() => router.push("/study")} className="text-[color:var(--ink-soft)] text-sm">
          ‹ Study
        </button>
        <p className="eyebrow">Quiz{title ? ` · ${title}` : ""}</p>
        <span className="w-8" />
      </header>

      {questions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-[color:var(--ink-soft)]">Couldn&apos;t build a quiz right now.</p>
          <button onClick={() => course && generate(course)} className="btn">Try again</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map((question, qi) => (
            <div key={qi} className="card p-4">
              <p className="font-semibold text-sm mb-3">
                {qi + 1}. {question.q}
              </p>
              <div className="flex flex-col gap-2">
                {question.options.map((opt, oi) => {
                  const chosen = answers[qi] === oi;
                  const correct = result && result.correctAnswers[qi] === oi;
                  const wrongChosen = result && chosen && result.correctAnswers[qi] !== oi;
                  return (
                    <button
                      key={oi}
                      disabled={!!result}
                      onClick={() => setAnswers((a) => a.map((v, k) => (k === qi ? oi : v)))}
                      className="tile px-3 py-2.5 text-left text-sm flex items-center gap-2"
                      style={{
                        borderColor: correct
                          ? "#2438e0"
                          : wrongChosen
                            ? "#d8613a"
                            : chosen
                              ? "var(--accent)"
                              : undefined,
                        background: correct
                          ? "var(--accent-soft)"
                          : chosen && !result
                            ? "var(--accent-soft)"
                            : undefined,
                      }}
                    >
                      <span className="text-[color:var(--ink-faint)]">
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {correct && <span>✓</span>}
                      {wrongChosen && <span>✗</span>}
                    </button>
                  );
                })}
              </div>
              {result?.explanations?.[qi] && (
                <p className="text-xs text-[color:var(--ink-soft)] mt-3 leading-relaxed border-t border-[color:var(--line)] pt-2">
                  <span className="font-semibold">Why: </span>
                  {result.explanations[qi]}
                </p>
              )}
            </div>
          ))}

          {result ? (
            <div className="card p-5 text-center">
              <p className="display text-4xl font-semibold" style={{ color: "var(--accent)" }}>
                {result.score}/{result.total}
              </p>
              <p className="text-sm text-[color:var(--ink-soft)] mt-1">+{result.xp} XP earned</p>
              <div className="flex gap-2 mt-4">
                <button onClick={() => course && generate(course)} className="btn-accent flex-1">
                  New quiz
                </button>
                <button onClick={() => router.push("/study")} className="btn-ghost flex-1">
                  Done
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={submit}
              disabled={submitting || answers.some((a) => a < 0)}
              className="btn"
            >
              {submitting ? "Marking…" : "Submit answers"}
            </button>
          )}
        </div>
      )}
      <Nav />
    </main>
  );
}
