"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function Landing() {
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace("/home");
    });
  }, [router]);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-7 min-h-screen">
      <div className="text-7xl floaty">🎓</div>
      <h1 className="text-5xl font-black bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-300 bg-clip-text text-transparent">
        Pocket Teacher
      </h1>
      <p className="text-slate-300 max-w-xs leading-relaxed text-[15px]">
        The best teacher — in your pocket. It adapts to{" "}
        <span className="text-fuchsia-300 font-semibold">you</span>: your strengths,
        your weaknesses, your habits. Any subject, any level, all the way to your exam.
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-xs">
        {["🔥 Streaks", "⚡ XP & levels", "📸 Upload anything", "🇲🇺 Any grade"].map((c) => (
          <span key={c} className="chip">{c}</span>
        ))}
      </div>
      <Link href="/login" className="btn w-full max-w-xs text-lg pop">
        Start learning →
      </Link>
      <p className="text-xs text-slate-500">Primary · SC · HSC · University · Mauritius 🇲🇺</p>
    </main>
  );
}
