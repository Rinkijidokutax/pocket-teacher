"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { taskHref } from "@/lib/tasks";
import Nav from "@/components/Nav";

type Task = {
  id: string;
  title: string;
  kind: string;
  done: boolean;
  due: string;
  topic_id: string | null;
};

export default function Plan() {
  const router = useRouter();
  const [course, setCourse] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load(courseId: string) {
    const { data } = await supabase
      .from("study_tasks")
      .select("id, title, kind, done, due, topic_id")
      .eq("course_id", courseId)
      .order("due");
    setTasks((data ?? []) as Task[]);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const c = new URLSearchParams(window.location.search).get("course");
      setCourse(c);
      if (c) load(c);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(id: string, done: boolean) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, done } : x)));
    await supabase.from("study_tasks").update({ done }).eq("id", id);
  }

  async function regenerate() {
    if (!course) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course }),
      });
      if (res.ok) {
        await load(course);
      } else {
        const out = await res.json().catch(() => ({}));
        setErr(
          out.error === "no_mastery"
            ? "Do a quiz first so we can find your weak topics."
            : out.error === "no_topics"
              ? "Add some topics to this course first."
              : "Couldn’t build your plan just now — give it another tap.",
        );
      }
    } catch {
      setErr("Couldn’t build your plan just now — give it another tap.");
    }
    setBusy(false);
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const byDay = tasks.reduce<Record<string, Task[]>>((acc, t) => {
    (acc[t.due] ??= []).push(t);
    return acc;
  }, {});

  return (
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-4 min-h-screen">
      <header className="flex items-center justify-between">
        <button onClick={() => router.push("/study")} className="text-[color:var(--ink-soft)] text-sm">
          ‹ Study
        </button>
        <p className="eyebrow">Revision plan</p>
        <span className="w-8" />
      </header>
      <h1 className="display text-3xl font-semibold rise">Your schedule</h1>

      {tasks.length === 0 ? (
        <div className="card p-6 text-center text-[color:var(--ink-soft)] rise d1">
          <p className="mb-3">No plan yet.</p>
          <button onClick={regenerate} disabled={busy || !course} className="btn">
            {busy ? "Building…" : "Build my revision plan"}
          </button>
          {err && (
            <p className="text-sm mt-3" style={{ color: "var(--streak-text)" }}>
              {err}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 rise d1">
            {Object.entries(byDay).map(([day, dayTasks]) => (
              <div key={day}>
                <p className="eyebrow mb-1.5">{fmt(day)}</p>
                <div className="flex flex-col gap-2">
                  {dayTasks.map((t) => (
                    <div key={t.id} className="card px-4 py-3 flex items-center gap-3">
                      <button
                        onClick={() => toggle(t.id, !t.done)}
                        aria-label={t.done ? "Mark not done" : "Mark done"}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[11px] shrink-0"
                        style={{
                          borderColor: t.done ? "var(--accent)" : "var(--line-strong)",
                          background: t.done ? "var(--accent)" : "transparent",
                          color: "#fff",
                        }}
                      >
                        {t.done ? "✓" : ""}
                      </button>
                      <Link
                        href={taskHref(t.kind, course, t.topic_id)}
                        className={`text-sm flex-1 ${t.done ? "line-through opacity-50" : ""}`}
                      >
                        {t.title}
                      </Link>
                      <span className="eyebrow">{t.kind}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={regenerate} disabled={busy} className="btn-ghost mt-2">
            {busy ? "Rebuilding…" : "Rebuild plan"}
          </button>
          {err && (
            <p className="text-sm" style={{ color: "var(--streak-text)" }}>
              {err}
            </p>
          )}
        </>
      )}
      <Nav />
    </main>
  );
}
