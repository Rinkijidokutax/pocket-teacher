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
    // enroll in each picked course via the API (seeds mastery)
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
    <main className="flex-1 flex flex-col px-6 max-w-md mx-auto w-full min-h-screen py-10 gap-6">
      <div className="flex gap-1.5">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-fuchsia-500" : "bg-white/10"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <>
          <h1 className="text-2xl font-black">Where are you in your studies?</h1>
          <div className="flex flex-col gap-2.5">
            {LADDER.map((l) => (
              <button
                key={l.id}
                onClick={() => setLevel(l.id)}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left border transition ${
                  level === l.id
                    ? "border-fuchsia-400 bg-fuchsia-500/15"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <span className="text-2xl">{l.emoji}</span>
                <div>
                  <p className="font-bold text-[15px]">{l.label}</p>
                  <p className="text-xs text-slate-400">{l.hint}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-1">
            <p className="text-sm text-slate-300 mb-2">Preferred language</p>
            <div className="flex gap-2">
              {[
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
              ].map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLanguage(l.id)}
                  className={`flex-1 rounded-2xl py-3 border font-semibold ${
                    language === l.id
                      ? "border-fuchsia-400 bg-fuchsia-500/15"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <button
            disabled={!level}
            onClick={() => setStep(2)}
            className="btn mt-auto"
          >
            Next →
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="text-2xl font-black">Pick your subjects</h1>
          <p className="text-slate-400 text-sm -mt-3">
            Choose what you&apos;re studying. You can add more (or upload your own
            syllabus) anytime.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`rounded-2xl p-3 text-left border transition ${
                  picked.has(c.id)
                    ? "border-fuchsia-400 bg-fuchsia-500/15"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="text-2xl">{c.emoji}</div>
                <p className="font-bold text-sm mt-1 leading-tight">{c.subject}</p>
                <p className="text-[10px] text-slate-400">{c.board}</p>
              </button>
            ))}
          </div>
          {courses.length === 0 && (
            <p className="text-slate-500 text-sm">Loading subjects…</p>
          )}
          <label className="text-sm text-slate-300 mt-1">
            Exam date (optional)
            <input
              type="date"
              className="input mt-2"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </label>
          <div className="flex gap-2 mt-auto">
            <button onClick={() => setStep(1)} className="btn-ghost flex-1">
              Back
            </button>
            <button
              disabled={picked.size === 0 || busy}
              onClick={finish}
              className="btn flex-[2]"
            >
              {busy ? "Setting up…" : `Start (${picked.size}) →`}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
