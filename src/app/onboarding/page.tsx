"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const LEVELS = [
  { id: "grade9", label: "Grade 9 (pre-SC)" },
  { id: "o_level", label: "O-Level / SC (Grade 10–11)" },
];

export default function Onboarding() {
  const router = useRouter();
  const [level, setLevel] = useState("o_level");
  const [examDate, setExamDate] = useState("");
  const [goal, setGoal] = useState("");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.replace("/login");
    await supabase
      .from("profiles")
      .update({ level, exam_date: examDate || null, goal: goal || null, language })
      .eq("id", user.id);
    router.replace("/diagnostic");
  }

  return (
    <main className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full min-h-screen gap-5 py-10">
      <h1 className="text-2xl font-bold">Tell your teacher about you</h1>
      <p className="text-slate-400 text-sm -mt-3">
        Subject for now: <span className="text-violet-300">Cambridge O-Level Mathematics</span>
      </p>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="text-sm text-slate-300">
          Your level
          <div className="flex flex-col gap-2 mt-2">
            {LEVELS.map((l) => (
              <button
                type="button"
                key={l.id}
                onClick={() => setLevel(l.id)}
                className={`rounded-2xl px-4 py-3 text-left border ${
                  level === l.id
                    ? "border-violet-400 bg-violet-500/20"
                    : "border-white/10 bg-white/5"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </label>
        <label className="text-sm text-slate-300">
          Exam date (SC exams)
          <input
            type="date"
            className="input mt-2"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
          />
        </label>
        <label className="text-sm text-slate-300">
          Your goal
          <input
            className="input mt-2"
            placeholder="e.g. Get a credit in Maths for HSC"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <label className="text-sm text-slate-300">
          Preferred language
          <div className="flex gap-2 mt-2">
            {[
              { id: "en", label: "English" },
              { id: "fr", label: "Français" },
            ].map((l) => (
              <button
                type="button"
                key={l.id}
                onClick={() => setLanguage(l.id)}
                className={`rounded-2xl px-5 py-3 border flex-1 ${
                  language === l.id
                    ? "border-violet-400 bg-violet-500/20"
                    : "border-white/10 bg-white/5"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </label>
        <button
          disabled={busy}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded-2xl py-4 mt-2"
        >
          Next: quick placement quiz →
        </button>
      </form>
    </main>
  );
}
