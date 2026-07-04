"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { taskHref } from "@/lib/tasks";
import Nav from "@/components/Nav";
import Pomodoro from "@/components/Pomodoro";

type Course = { course_id: string; courses: { subject: string; emoji: string } | null };
type Task = { id: string; title: string; kind: string; done: boolean; due: string; topic_id: string | null };

export default function Study() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [active, setActive] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<{ title: string; content: string } | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

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
      if (en[0]) setActive(en[0].course_id);
      setLoaded(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!active) return;
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from("study_tasks")
      .select("id, title, kind, done, due, topic_id")
      .eq("course_id", active)
      .lte("due", today)
      .eq("done", false)
      .order("due")
      .then(({ data }) => setTasks((data ?? []) as Task[]));
  }, [active]);

  async function makeSummary() {
    setBusy("summary");
    setSummary(null);
    setErr("");
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: active }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy("");
    if (out.summary) setSummary(out.summary);
    else setErr("Couldn’t write a summary just now — give it another tap.");
  }

  async function buildPlan() {
    setBusy("plan");
    setErr("");
    const res = await fetch("/api/plan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: active }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy("");
    if (res.ok && (out.created ?? 0) > 0) {
      router.push(`/plan?course=${active}`);
    } else if (out.error === "no_mastery") {
      setErr("Do a quick lesson or quiz first — then I can plan your revision.");
    } else {
      setErr("Couldn’t build a plan just now — give it another tap.");
    }
  }


  const tiles = [
    { key: "summary", icon: "≣", label: "AI summary", sub: "Notes → revise-ready", onClick: makeSummary },
    { key: "flashcards", icon: "▤", label: "Flashcards", sub: "Active recall", onClick: () => router.push(`/flashcards?course=${active}`) },
    { key: "quiz", icon: "◎", label: "Quiz me", sub: "Adaptive questions", onClick: () => router.push(`/quiz?course=${active}`) },
    { key: "plan", icon: "◱", label: "Revision plan", sub: "Day-by-day to exam", onClick: buildPlan },
  ];

  return (
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <h1 className="display text-3xl font-semibold rise">Study</h1>

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
                onClick={() => setActive(c.course_id)}
                className={`chip whitespace-nowrap ${active === c.course_id ? "chip-on" : ""}`}
              >
                {c.courses?.emoji} {c.courses?.subject}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 rise d1">
            {tiles.map((t) => (
              <button
                key={t.key}
                onClick={t.onClick}
                disabled={!!busy}
                className="card p-4 text-left transition hover:-translate-y-0.5 disabled:opacity-60"
              >
                <div className="text-2xl" style={{ color: "var(--accent)" }}>{t.icon}</div>
                <p className="font-semibold text-sm mt-2">{busy === t.key ? "Working…" : t.label}</p>
                <p className="text-[11px] text-[color:var(--ink-faint)]">{t.sub}</p>
              </button>
            ))}
          </div>

          {err && (
            <p className="text-sm rise" style={{ color: "var(--streak)" }}>
              {err}
            </p>
          )}

          {summary && (
            <div className="card p-5 rise">
              <p className="eyebrow">Summary</p>
              <p className="display text-lg font-semibold mt-1">{summary.title}</p>
              <p className="text-sm text-[color:var(--ink-soft)] whitespace-pre-wrap mt-2 leading-relaxed">
                {summary.content}
              </p>
            </div>
          )}

          <div className="rise">
            <Pomodoro />
          </div>

          <section className="rise">
            <p className="eyebrow mb-2">Today&apos;s plan</p>
            {tasks.length === 0 ? (
              <p className="text-sm text-[color:var(--ink-faint)]">
                Nothing due — tap “Revision plan” to build your schedule to exam.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {tasks.map((t) => (
                  <Link
                    key={t.id}
                    href={taskHref(t.kind, active, t.topic_id)}
                    className="card px-4 py-3 flex items-center gap-3 text-left"
                  >
                    <span className="w-5 h-5 rounded-full border-2 border-[color:var(--line-strong)]" />
                    <span className="text-sm flex-1">{t.title}</span>
                    <span className="eyebrow">{t.kind}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      <Nav />
    </main>
  );
}
