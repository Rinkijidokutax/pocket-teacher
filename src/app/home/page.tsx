"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Weak = { topic_id: string; score: number; syllabus_topics: { name: string } | null };

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [streak, setStreak] = useState(0);
  const [daysToExam, setDaysToExam] = useState<number | null>(null);
  const [weakest, setWeakest] = useState<Weak[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: p } = await supabase
        .from("profiles")
        .select("name, streak, exam_date, onboarded")
        .eq("id", user.id)
        .single();
      if (!p?.onboarded) return router.replace("/onboarding");
      setName(p.name?.split(" ")[0] ?? "");
      setStreak(p.streak);
      if (p.exam_date)
        setDaysToExam(
          Math.ceil((new Date(p.exam_date).getTime() - Date.now()) / 86400000)
        );
      const { data: m } = await supabase
        .from("mastery")
        .select("topic_id, score, syllabus_topics(name)")
        .eq("user_id", user.id)
        .order("score", { ascending: true })
        .limit(3);
      setWeakest((m ?? []) as unknown as Weak[]);
      setLoaded(true);
    })();
  }, [router]);

  if (!loaded)
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 animate-pulse">Loading…</p>
      </main>
    );

  return (
    <main className="flex-1 px-6 pt-12 pb-28 max-w-md mx-auto w-full flex flex-col gap-6 min-h-screen">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hi {name} 👋</h1>
          <p className="text-slate-400 text-sm">Ready for today&apos;s lesson?</p>
        </div>
        <button
          className="text-xs text-slate-500"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/");
          }}
        >
          Sign out
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
          <p className="text-3xl font-bold">🔥 {streak}</p>
          <p className="text-slate-400 text-xs mt-1">day streak</p>
        </div>
        <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
          <p className="text-3xl font-bold">
            {daysToExam !== null ? `📅 ${daysToExam}` : "📅 —"}
          </p>
          <p className="text-slate-400 text-xs mt-1">
            {daysToExam !== null ? "days to exam" : "set exam date"}
          </p>
        </div>
      </div>

      <Link
        href="/session"
        className="rounded-3xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-6 text-center"
      >
        <p className="text-xl font-bold">Start today&apos;s lesson →</p>
        <p className="text-violet-200 text-sm mt-1">
          Your teacher has a plan ready for you
        </p>
      </Link>

      <section>
        <h2 className="text-sm text-slate-400 mb-2">We&apos;ll work on</h2>
        <div className="flex flex-col gap-2">
          {weakest.map((w) => (
            <div
              key={w.topic_id}
              className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 flex justify-between items-center"
            >
              <span className="text-sm">{w.syllabus_topics?.name}</span>
              <span className="text-xs text-slate-400">{w.score}/100</span>
            </div>
          ))}
        </div>
      </section>
      <Nav />
    </main>
  );
}
