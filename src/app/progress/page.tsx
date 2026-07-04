"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import XpHeader from "@/components/XpHeader";

type Course = { course_id: string; courses: { subject: string; emoji: string } | null };
type Row = {
  topic_id: string;
  score: number;
  topics: { name: string; unit: string; sort: number; course_id: string } | null;
};

function color(s: number) {
  if (s >= 75) return "#34d399";
  if (s >= 50) return "#a3e635";
  if (s >= 30) return "#fbbf24";
  return "#fb7185";
}

export default function Progress() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ name: string; xp: number; streak: number } | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [active, setActive] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: p } = await supabase
        .from("profiles")
        .select("name, xp, streak")
        .eq("id", user.id)
        .maybeSingle();
      setProfile({ name: p?.name?.split(" ")[0] ?? "", xp: p?.xp ?? 0, streak: p?.streak ?? 0 });
      const { data: e } = await supabase
        .from("enrollments")
        .select("course_id, courses(subject, emoji)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const en = (e ?? []) as unknown as Course[];
      setCourses(en);
      if (en[0]) setActive(en[0].course_id);
    })();
  }, [router]);

  useEffect(() => {
    if (!active) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: topics } = await supabase
        .from("topics")
        .select("id")
        .eq("course_id", active);
      const ids = (topics ?? []).map((t) => t.id);
      if (ids.length === 0) return setRows([]);
      const { data } = await supabase
        .from("mastery")
        .select("topic_id, score, topics(name, unit, sort, course_id)")
        .eq("user_id", user.id)
        .in("topic_id", ids);
      const sorted = ((data ?? []) as unknown as Row[]).sort(
        (a, b) => (a.topics?.sort ?? 0) - (b.topics?.sort ?? 0)
      );
      setRows(sorted);
    })();
  }, [active]);

  const units = [...new Set(rows.map((r) => r.topics?.unit))].filter(Boolean) as string[];
  const overall = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length)
    : 0;

  return (
    <main className="flex-1 px-5 pt-12 pb-28 max-w-md mx-auto w-full flex flex-col gap-4 min-h-screen">
      <h1 className="text-2xl font-black">Your map 🗺️</h1>
      {profile && <XpHeader name={profile.name} xp={profile.xp} streak={profile.streak} />}

      {courses.length === 0 ? (
        <Link href="/courses" className="card p-5 text-center text-slate-300">
          Add a subject to start building your map →
        </Link>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {courses.map((c) => (
              <button
                key={c.course_id}
                onClick={() => setActive(c.course_id)}
                className={`chip whitespace-nowrap ${
                  active === c.course_id ? "bg-fuchsia-500/25 border-fuchsia-400/50" : ""
                }`}
              >
                {c.courses?.emoji} {c.courses?.subject}
              </button>
            ))}
          </div>

          {rows.length > 0 && (
            <div className="card p-4 flex items-center justify-between">
              <p className="text-sm text-slate-300">Overall mastery</p>
              <p className="text-2xl font-black" style={{ color: color(overall) }}>
                {overall}%
              </p>
            </div>
          )}

          {units.map((unit) => {
            const ur = rows.filter((r) => r.topics?.unit === unit);
            return (
              <section key={unit}>
                <h2 className="text-xs font-bold text-slate-300 mb-1.5">{unit}</h2>
                <div className="flex flex-col gap-1.5">
                  {ur.map((r) => (
                    <div key={r.topic_id} className="flex items-center gap-2.5">
                      <div className="flex-1 text-xs text-slate-300 truncate">
                        {r.topics?.name}
                      </div>
                      <div className="w-24 h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${r.score}%`, background: color(r.score) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
      <Nav />
    </main>
  );
}
