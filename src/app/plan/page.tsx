"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Task = { id: string; title: string; kind: string; done: boolean; due: string };

export default function Plan() {
  const router = useRouter();
  const [course, setCourse] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);

  async function load(courseId: string) {
    const { data } = await supabase
      .from("study_tasks")
      .select("id, title, kind, done, due")
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
    await fetch("/api/plan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: course }),
    });
    await load(course);
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
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 rise d1">
            {Object.entries(byDay).map(([day, dayTasks]) => (
              <div key={day}>
                <p className="eyebrow mb-1.5">{fmt(day)}</p>
                <div className="flex flex-col gap-2">
                  {dayTasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => toggle(t.id, !t.done)}
                      className="card px-4 py-3 flex items-center gap-3 text-left"
                    >
                      <span
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[11px]"
                        style={{
                          borderColor: t.done ? "var(--accent)" : "var(--line-strong)",
                          background: t.done ? "var(--accent)" : "transparent",
                          color: "#fff",
                        }}
                      >
                        {t.done ? "✓" : ""}
                      </span>
                      <span className={`text-sm flex-1 ${t.done ? "line-through opacity-50" : ""}`}>
                        {t.title}
                      </span>
                      <span className="eyebrow">{t.kind}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={regenerate} disabled={busy} className="btn-ghost mt-2">
            {busy ? "Rebuilding…" : "Rebuild plan"}
          </button>
        </>
      )}
      <Nav />
    </main>
  );
}
