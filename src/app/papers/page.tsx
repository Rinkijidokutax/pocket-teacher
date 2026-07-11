"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Course = {
  course_id: string;
  courses: { subject: string; emoji: string; syllabus_code: string | null } | null;
};

// The only external URL this feature is ever allowed to use (official public finder).
const CAMBRIDGE_PAST_PAPERS = "https://www.cambridgeinternational.org/past-papers";

export default function Papers() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: e } = await supabase
        .from("enrollments")
        .select("course_id, courses(subject, emoji, syllabus_code)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      setCourses((e ?? []) as unknown as Course[]);
      setLoaded(true);
    })();
  }, [router]);

  async function generate(courseId: string) {
    setBusy(courseId);
    setErr("");
    try {
      const res = await fetch("/api/papers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const out = await res.json().catch(() => ({}));
      if (out.ok) router.push(`/practice?course=${courseId}`);
      else setErr("Couldn’t write your paper just now — give it another tap.");
    } catch {
      setErr("Couldn’t write your paper just now — give it another tap.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <h1 className="display text-3xl font-semibold rise">Exam papers</h1>
      <p className="text-sm text-[color:var(--ink-soft)] rise -mt-3">
        Sit an original AI practice paper, or find the real Cambridge past papers.
      </p>

      {!loaded ? (
        <p className="text-[color:var(--ink-faint)] animate-pulse rise">Loading…</p>
      ) : courses.length === 0 ? (
        <div className="card p-6 text-center text-[color:var(--ink-soft)]">
          Add a subject first to start revising.
        </div>
      ) : (
        <>
          {courses.map((c) => (
            <div key={c.course_id} className="card p-5 flex flex-col gap-4 rise">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl">{c.courses?.emoji}</span>
                <span className="font-semibold">{c.courses?.subject}</span>
                {c.courses?.syllabus_code && (
                  <span className="chip chip-on ml-auto">{c.courses.syllabus_code}</span>
                )}
              </div>

              <button
                onClick={() => generate(c.course_id)}
                disabled={!!busy}
                className="btn"
              >
                {busy === c.course_id ? "Writing your paper…" : "Generate a practice paper"}
              </button>

              {c.courses?.syllabus_code && (
                <a
                  href={CAMBRIDGE_PAST_PAPERS}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip text-center"
                >
                  Find official past papers →
                </a>
              )}
            </div>
          ))}

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
