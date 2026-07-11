"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import XpHeader from "@/components/XpHeader";

type Topic = { unit: string; name: string; score: number; attempts: number };
type Course = {
  subject: string;
  level: string;
  emoji: string;
  exam_date: string | null;
  topics: Topic[];
};
type Report = { name: string; streak: number; xp: number; courses: Course[] };

// mastery colour scale — copied from progress/page.tsx (keep in sync)
function color(s: number) {
  if (s >= 75) return "#2438e0";
  if (s >= 50) return "#5b6fe8";
  if (s >= 30) return "#c9971f";
  return "#d8613a";
}

function daysToExam(date: string | null) {
  if (!date) return null;
  const d = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  return d > 0 ? d : null; // hide when past
}

// Conversion surface for anyone (parent/teacher/friend) who opens a shared report.
function StartCta() {
  return (
    <Link href="/login" className="card p-5 flex flex-col items-center gap-3 text-center rise">
      <p className="display text-lg font-semibold">See your own subjects like this — free</p>
      <span className="btn w-full">Start your free progress map →</span>
    </Link>
  );
}

export default function Report() {
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");

  useEffect(() => {
    (async () => {
      const t = new URLSearchParams(window.location.search).get("t");
      if (!t) return setState("invalid");
      try {
        const { data, error } = await supabase.rpc("report_by_token", { p_token: t });
        if (error || !data || !(data as Report).name) return setState("invalid");
        setReport(data as Report);
        setState("ok");
      } catch {
        setState("invalid");
      }
    })();
  }, []);

  return (
    <main className="flex-1 px-6 pt-14 pb-16 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      {state === "loading" && (
        <p className="text-[color:var(--ink-faint)] animate-pulse rise">Loading report…</p>
      )}

      {state === "invalid" && (
        <div className="card p-6 text-center text-[color:var(--ink-soft)] rise">
          This report link isn&apos;t valid.
        </div>
      )}

      {state === "ok" && report && (
        <>
          <div className="rise">
            <p className="eyebrow">Progress report</p>
            <h1 className="display text-3xl font-semibold mt-1">{report.name}</h1>
          </div>

          <XpHeader xp={report.xp} streak={report.streak} />

          <StartCta />

          {report.courses.map((c, ci) => {
            const days = daysToExam(c.exam_date);
            const units = [...new Set(c.topics.map((t) => t.unit))].filter(Boolean) as string[];
            const graded = c.topics.filter((t) => t.attempts > 0);
            const overall = graded.length
              ? Math.round(graded.reduce((s, t) => s + t.score, 0) / graded.length)
              : 0;
            return (
              <section key={ci} className={`card p-5 flex flex-col gap-4 rise ${ci < 3 ? "d1" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="display text-xl font-semibold">
                      {c.emoji} {c.subject}
                    </p>
                    <p className="text-xs text-[color:var(--ink-faint)] mt-0.5">{c.level}</p>
                  </div>
                  <div className="text-right">
                    <p className="display text-3xl font-semibold" style={{ color: color(overall) }}>
                      {overall}
                      <span className="text-base">%</span>
                    </p>
                    {days != null && (
                      <p className="text-xs text-[color:var(--ink-faint)] mt-0.5">
                        {days} day{days === 1 ? "" : "s"} to exam
                      </p>
                    )}
                  </div>
                </div>

                {units.map((unit) => {
                  const ur = c.topics.filter((t) => t.unit === unit);
                  return (
                    <div key={unit}>
                      <p className="eyebrow mb-2">{unit}</p>
                      <div className="flex flex-col gap-2">
                        {ur.map((t, ti) => (
                          <div key={ti} className="flex items-center gap-3">
                            <div className="flex-1 text-[13px] truncate">{t.name}</div>
                            <div className="w-24 h-1.5 rounded-full bg-[color:var(--paper-2)] overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${t.score}%`, background: color(t.score) }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}

          <StartCta />

          <p className="text-xs text-[color:var(--ink-faint)] text-center mt-2 rise">
            Generated by Pocket Teacher — a free AI tutor for Mauritian students.
          </p>
        </>
      )}
    </main>
  );
}
