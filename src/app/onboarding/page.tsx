"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { LADDER } from "@/lib/ladder";

type Course = { id: string; subject: string; emoji: string; board: string };

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [level, setLevel] = useState("");
  const [language, setLanguage] = useState("en");
  const [courses, setCourses] = useState<Course[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [examDate, setExamDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== 2 || !level) return;
    supabase
      .from("courses")
      .select("id, subject, emoji, board")
      .eq("is_template", true)
      .eq("level", level)
      .order("subject")
      .then(({ data }) => setCourses(data ?? []));
  }, [step, level]);

  function toggle(id: string) {
    const n = new Set(picked);
    n.has(id) ? n.delete(id) : n.add(id);
    setPicked(n);
  }

  async function finish() {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.replace("/login");
    await supabase
      .from("profiles")
      .update({ level, language, exam_date: examDate || null, onboarded: true })
      .eq("id", user.id);
    await Promise.all(
      [...picked].map((courseId) =>
        fetch("/api/courses/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, examDate: examDate || null }),
        })
      )
    );
    router.replace("/home");
  }

  return (
    <main className="flex-1 flex flex-col px-7 max-w-md mx-auto w-full min-h-screen py-12 gap-7">
      <div className="flex items-center gap-3">
        <span className="eyebrow">Step {step} of 2</span>
        <div className="flex gap-1.5 flex-1">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition"
              style={{ background: s <= step ? "var(--accent)" : "var(--line-strong)" }}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <>
          <h1 className="display text-4xl font-semibold rise">
            Where are you
            <br />
            in your studies?
          </h1>
          <div className="flex flex-col gap-2 rise d1">
            {LADDER.map((l) => (
              <button
                key={l.id}
                onClick={() => setLevel(l.id)}
                className={`tile ${level === l.id ? "tile-on" : ""} flex items-center gap-3 px-4 py-3.5 text-left`}
              >
                <span className="text-2xl">{l.emoji}</span>
                <div className="flex-1">
                  <p className="font-semibold text-[15px]">{l.label}</p>
                  <p className="text-xs text-[color:var(--ink-faint)]">{l.hint}</p>
                </div>
                {level === l.id && <span style={{ color: "var(--accent)" }}>●</span>}
              </button>
            ))}
          </div>
          <div className="rise d2">
            <p className="eyebrow mb-2">Language</p>
            <div className="flex gap-2">
              {[
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
              ].map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLanguage(l.id)}
                  className={`tile ${language === l.id ? "tile-on" : ""} flex-1 py-3 font-semibold text-sm`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <button disabled={!level} onClick={() => setStep(2)} className="btn mt-auto">
            Continue →
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="display text-4xl font-semibold rise">Pick your subjects</h1>
          <p className="text-sm text-[color:var(--ink-soft)] -mt-4 rise">
            Choose what you&apos;re studying. Add more — or upload your own syllabus —
            anytime.
          </p>
          <div className="grid grid-cols-2 gap-2.5 rise d1">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`tile ${picked.has(c.id) ? "tile-on" : ""} p-3.5 text-left`}
              >
                <div className="text-2xl">{c.emoji}</div>
                <p className="font-semibold text-sm mt-1.5 leading-tight">{c.subject}</p>
                <p className="text-[10px] text-[color:var(--ink-faint)] uppercase tracking-wide">
                  {c.board}
                </p>
              </button>
            ))}
          </div>
          {courses.length === 0 && (
            <p className="text-[color:var(--ink-faint)] text-sm">Loading subjects…</p>
          )}
          <div className="rise d2">
            <p className="eyebrow mb-2">Exam date (optional)</p>
            <input
              type="date"
              className="input"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2 mt-auto">
            <button onClick={() => setStep(1)} className="btn-ghost flex-1">
              Back
            </button>
            <button
              disabled={picked.size === 0 || busy}
              onClick={finish}
              className="btn flex-[2]"
            >
              {busy ? "Setting up…" : `Start · ${picked.size} subject${picked.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
