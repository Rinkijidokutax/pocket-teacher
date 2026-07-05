"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import { LADDER } from "@/lib/ladder";

type Course = { id: string; subject: string; emoji: string; board: string; level: string };

export default function Courses() {
  const router = useRouter();
  const [level, setLevel] = useState("o_level");
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: p } = await supabase
        .from("profiles")
        .select("level")
        .eq("id", user.id)
        .maybeSingle();
      if (p?.level) setLevel(p.level);
      const { data: e } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", user.id);
      setEnrolled(new Set((e ?? []).map((r) => r.course_id)));
    })();
  }, [router]);

  useEffect(() => {
    supabase
      .from("courses")
      .select("id, subject, emoji, board, level")
      .eq("is_template", true)
      .eq("level", level)
      .order("subject")
      .then(({ data }) => setCourses(data ?? []));
  }, [level]);

  async function enroll(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/courses/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: id }),
      });
      if (r.ok) setEnrolled(new Set(enrolled).add(id));
      else alert("Couldn’t add that subject — try again.");
    } catch {
      alert("Couldn’t add that subject — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <h1 className="display text-3xl font-semibold rise">Add a subject</h1>

      <Link href="/library?syllabus=1" className="card p-4 flex items-center gap-3 rise d1">
        <span className="text-2xl">📄</span>
        <div className="flex-1">
          <p className="font-semibold text-sm">Upload your own syllabus</p>
          <p className="text-xs text-[color:var(--ink-faint)]">
            PDF or photo — we build a custom course from it
          </p>
        </div>
        <span style={{ color: "var(--accent)" }}>→</span>
      </Link>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 rise d2">
        {LADDER.filter((l) => !["university", "self"].includes(l.id)).map((l) => (
          <button
            key={l.id}
            onClick={() => setLevel(l.id)}
            className={`chip whitespace-nowrap ${level === l.id ? "chip-on" : ""}`}
          >
            {l.emoji} {l.hint}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 rise d2">
        {courses.map((c) => {
          const on = enrolled.has(c.id);
          return (
            <button
              key={c.id}
              disabled={on || busy === c.id}
              onClick={() => enroll(c.id)}
              className="card p-4 text-left transition hover:-translate-y-0.5 disabled:hover:translate-y-0"
            >
              <div className="text-2xl">{c.emoji}</div>
              <p className="font-semibold text-sm mt-2 leading-tight">{c.subject}</p>
              <p className="eyebrow mt-0.5">{c.board}</p>
              <span
                className="inline-block mt-2 text-[11px] font-bold"
                style={{ color: on ? "var(--ink-faint)" : "var(--accent)" }}
              >
                {busy === c.id ? "…" : on ? "✓ Added" : "+ Add"}
              </span>
            </button>
          );
        })}
      </div>
      <Nav />
    </main>
  );
}
