"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Course = { course_id: string; courses: { subject: string; emoji: string } | null };
type Q = { q: string; options: string[] };

export default function Diagnostic() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [ci, setCi] = useState(0);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: e } = await supabase
        .from("enrollments")
        .select("course_id, courses(subject, emoji)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const en = (e ?? []) as unknown as Course[];
      setCourses(en);
      if (en.length === 0) return router.replace("/home");
      loadFor(en[0].course_id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFor(courseId: string) {
    setLoading(true);
    setQuizId(null);
    const res = await fetch("/api/diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    });
    const out = await res.json().catch(() => ({}));
    setLoading(false);
    if (out.quizId && out.questions?.length) {
      setQuizId(out.quizId);
      setQuestions(out.questions);
      setAnswers(new Array(out.questions.length).fill(-1));
    } else {
      next(); // generation failed — skip this subject
    }
  }

  function next() {
    const n = ci + 1;
    if (n >= courses.length) return router.replace("/home");
    setCi(n);
    setQuestions([]);
    loadFor(courses[n].course_id);
  }

  async function submit() {
    if (quizId) {
      await fetch("/api/diagnostic/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, answers }),
      }).catch(() => {});
    }
    next();
  }

  const subject = courses[ci]?.courses;

  if (loading)
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-3xl animate-pulse">{subject?.emoji ?? "◎"}</p>
        <p className="text-[color:var(--ink-soft)]">
          Getting a feel for your level in {subject?.subject ?? "your subject"}…
        </p>
      </main>
    );

  return (
    <main className="flex flex-col min-h-screen max-w-md mx-auto w-full px-6 pt-14 pb-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="eyebrow">Quick check {ci + 1}/{courses.length}</span>
        <div className="flex gap-1.5 flex-1">
          {courses.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ background: i <= ci ? "var(--accent)" : "var(--line-strong)" }}
            />
          ))}
        </div>
      </div>
      <h1 className="display text-3xl font-semibold mb-1">
        {subject?.emoji} {subject?.subject}
      </h1>
      <p className="text-sm text-[color:var(--ink-soft)] mb-4">
        A few quick questions so your teacher knows where to start. Best guess is fine.
      </p>

      <div className="flex flex-col gap-3 flex-1">
        {questions.map((question, qi) => (
          <div key={qi} className="card p-4">
            <p className="font-semibold text-sm mb-3">
              {qi + 1}. {question.q}
            </p>
            <div className="flex flex-col gap-2">
              {question.options.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => setAnswers((a) => a.map((v, k) => (k === qi ? oi : v)))}
                  className="tile px-3 py-2.5 text-left text-sm"
                  style={answers[qi] === oi ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}
                >
                  {String.fromCharCode(65 + oi)}. {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={next} className="btn-ghost flex-1">
          Skip
        </button>
        <button onClick={submit} className="btn flex-[2]">
          {ci + 1 >= courses.length ? "Finish →" : "Next subject →"}
        </button>
      </div>
    </main>
  );
}
