"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Row = {
  topic_id: string;
  score: number;
  syllabus_topics: { name: string; unit: string; sort: number } | null;
};

function color(score: number) {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-lime-500";
  if (score >= 30) return "bg-amber-500";
  return "bg-rose-500";
}

export default function Progress() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [streak, setStreak] = useState(0);
  const [daysToExam, setDaysToExam] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: p } = await supabase
        .from("profiles")
        .select("streak, exam_date")
        .eq("id", user.id)
        .single();
      setStreak(p?.streak ?? 0);
      if (p?.exam_date)
        setDaysToExam(
          Math.ceil((new Date(p.exam_date).getTime() - Date.now()) / 86400000)
        );
      const { data } = await supabase
        .from("mastery")
        .select("topic_id, score, syllabus_topics(name, unit, sort)")
        .eq("user_id", user.id);
      const sorted = ((data ?? []) as unknown as Row[]).sort(
        (a, b) => (a.syllabus_topics?.sort ?? 0) - (b.syllabus_topics?.sort ?? 0)
      );
      setRows(sorted);
    })();
  }, [router]);

  const units = [...new Set(rows.map((r) => r.syllabus_topics?.unit))].filter(
    Boolean
  ) as string[];

  return (
    <main className="flex-1 px-6 pt-12 pb-28 max-w-md mx-auto w-full flex flex-col gap-6 min-h-screen">
      <header className="flex justify-between items-end">
        <h1 className="text-2xl font-bold">Your map 🗺️</h1>
        <p className="text-sm text-slate-400">
          🔥 {streak}
          {daysToExam !== null && ` · ${daysToExam}d to exam`}
        </p>
      </header>
      {rows.length === 0 && (
        <p className="text-slate-400 text-sm">
          Finish the placement quiz to see your map.
        </p>
      )}
      {units.map((unit) => {
        const unitRows = rows.filter((r) => r.syllabus_topics?.unit === unit);
        const avg = Math.round(
          unitRows.reduce((s, r) => s + r.score, 0) / unitRows.length
        );
        return (
          <section key={unit}>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-slate-300">{unit}</h2>
              <span className="text-xs text-slate-500">{avg}/100</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {unitRows.map((r) => (
                <div key={r.topic_id} className="flex items-center gap-3">
                  <div className="flex-1 text-xs text-slate-400 truncate">
                    {r.syllabus_topics?.name}
                  </div>
                  <div className="w-28 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${color(r.score)}`}
                      style={{ width: `${r.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <Nav />
    </main>
  );
}
