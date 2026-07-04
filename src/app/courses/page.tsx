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
    await fetch("/api/courses/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: id }),
    });
    setEnrolled(new Set(enrolled).add(id));
    setBusy(null);
  }

  return (
    <main className="flex-1 px-5 pt-12 pb-28 max-w-md mx-auto w-full flex flex-col gap-4 min-h-screen">
      <h1 className="text-2xl font-black">Add a subject</h1>

      <Link href="/library?syllabus=1" className="card p-4 flex items-center gap-3">
        <span className="text-2xl">📄</span>
        <div>
          <p className="font-bold text-sm">Upload your own syllabus</p>
          <p className="text-xs text-slate-400">
            PDF or photo — we build a custom course from it
          </p>
        </div>
        <span className="ml-auto text-fuchsia-300">→</span>
      </Link>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {LADDER.filter((l) => !["university", "self"].includes(l.id)).map((l) => (
          <button
            key={l.id}
            onClick={() => setLevel(l.id)}
            className={`chip whitespace-nowrap ${
              level === l.id ? "bg-fuchsia-500/25 border-fuchsia-400/50" : ""
            }`}
          >
            {l.emoji} {l.hint}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {courses.map((c) => {
          const on = enrolled.has(c.id);
          return (
            <button
              key={c.id}
              disabled={on || busy === c.id}
              onClick={() => enroll(c.id)}
              className={`card p-4 text-left transition active:scale-[0.97] ${
                on ? "opacity-70" : ""
              }`}
            >
              <div className="text-3xl">{c.emoji}</div>
              <p className="font-bold text-sm mt-1.5 leading-tight">{c.subject}</p>
              <p className="text-[10px] text-slate-400">{c.board}</p>
              <span
                className={`inline-block mt-2 text-[11px] font-bold ${
                  on ? "text-emerald-300" : "text-fuchsia-300"
                }`}
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
