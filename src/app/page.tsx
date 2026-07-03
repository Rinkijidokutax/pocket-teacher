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
    <main className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6 min-h-screen">
      <div className="text-6xl">📖</div>
      <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
        Pocket Teacher
      </h1>
      <p className="text-slate-300 max-w-xs leading-relaxed">
        A teacher in your pocket — the best teacher, that adapts to{" "}
        <span className="text-violet-300">you</span>: your strengths, weaknesses
        and habits. Toward your goal — your courses, your level, your exams.
      </p>
      <Link
        href="/login"
        className="bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl px-10 py-4 text-lg"
      >
        Get started
      </Link>
      <p className="text-xs text-slate-500">Cambridge O-Level Maths · Mauritius 🇲🇺</p>
    </main>
  );
}
