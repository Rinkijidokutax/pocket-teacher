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

// mastery colour scale — muted paper → confident cobalt
function color(s: number) {
  if (s >= 75) return "#2438e0";
  if (s >= 50) return "#5b6fe8";
  if (s >= 30) return "#c9971f";
  return "#d8613a";
}

export default function Progress() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ xp: number; streak: number } | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [active, setActive] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: p } = await supabase
        .from("profiles")
        .select("xp, streak")
        .eq("id", user.id)
        .maybeSingle();
      setProfile({ xp: p?.xp ?? 0, streak: p?.streak ?? 0 });
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
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: topics } = await supabase.from("topics").select("id").eq("course_id", active);
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
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <h1 className="display text-3xl font-semibold rise">Your map</h1>
      {profile && <XpHeader xp={profile.xp} streak={profile.streak} />}

      {!loaded ? (
        <p className="text-[color:var(--ink-faint)] animate-pulse rise">Loading your map…</p>
      ) : courses.length === 0 ? (
        <Link href="/courses" className="card p-6 text-center text-[color:var(--ink-soft)]">
          Add a subject to start building your map →
        </Link>
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

          {rows.length > 0 && (
            <div className="card p-5 flex items-center justify-between rise d1">
              <div>
                <p className="eyebrow">Overall mastery</p>
                <p className="text-xs text-[color:var(--ink-faint)] mt-1">{rows.length} topics</p>
              </div>
              <p className="display text-4xl font-semibold" style={{ color: color(overall) }}>
                {overall}
                <span className="text-xl">%</span>
              </p>
            </div>
          )}

          {units.map((unit, ui) => {
            const ur = rows.filter((r) => r.topics?.unit === unit);
            return (
              <section key={unit} className={`rise ${ui < 3 ? "d2" : ""}`}>
                <p className="eyebrow mb-2">{unit}</p>
                <div className="flex flex-col gap-2">
                  {ur.map((r) => (
                    <div key={r.topic_id} className="flex items-center gap-3">
                      <div className="flex-1 text-[13px] truncate">{r.topics?.name}</div>
                      <div className="w-24 h-1.5 rounded-full bg-[color:var(--paper-2)] overflow-hidden">
                        <div
                          className="h-full rounded-full"
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
