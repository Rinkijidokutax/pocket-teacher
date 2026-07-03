"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { DIAGNOSTIC, seedScores } from "@/lib/diagnostic";

export default function Diagnostic() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const q = DIAGNOSTIC[i];

  async function pick(idx: number) {
    const next = { ...answers, [q.id]: idx };
    setAnswers(next);
    if (i + 1 < DIAGNOSTIC.length) {
      setI(i + 1);
      return;
    }
    // finished — seed mastery for every topic from unit scores
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.replace("/login");
    const { byUnit, overall } = seedScores(next);
    const { data: topics } = await supabase.from("syllabus_topics").select("id, unit");
    const rows = (topics ?? []).map((t) => ({
      user_id: user.id,
      topic_id: t.id,
      score: byUnit[t.unit] ?? overall,
    }));
    await supabase.from("mastery").upsert(rows);
    await supabase.from("profiles").update({ onboarded: true }).eq("id", user.id);
    router.replace("/home");
  }

  if (busy)
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-slate-300 animate-pulse">Building your learning map…</p>
      </main>
    );

  return (
    <main className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full min-h-screen gap-6">
      <div className="text-sm text-slate-400">
        Placement quiz · {i + 1}/{DIAGNOSTIC.length}
        <div className="h-1.5 bg-white/10 rounded-full mt-2">
          <div
            className="h-1.5 bg-violet-500 rounded-full transition-all"
            style={{ width: `${(i / DIAGNOSTIC.length) * 100}%` }}
          />
        </div>
      </div>
      <p className="text-xs text-violet-300">{q.unit}</p>
      <h1 className="text-xl font-semibold -mt-4">{q.q}</h1>
      <div className="flex flex-col gap-3">
        {q.options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => pick(idx)}
            className="rounded-2xl px-4 py-4 text-left border border-white/10 bg-white/5 hover:border-violet-400 active:bg-violet-500/20"
          >
            {opt}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Not sure? Best guess is fine — this just tells your teacher where to start.
      </p>
    </main>
  );
}
