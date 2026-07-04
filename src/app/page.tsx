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
    <main className="flex-1 flex flex-col min-h-screen max-w-md mx-auto w-full px-7 pt-20 pb-10">
      <p className="eyebrow rise">Pocket Teacher · Mauritius</p>
      <h1 className="display text-[3.4rem] font-semibold mt-4 rise d1">
        A teacher
        <br />
        that adapts
        <br />
        to <span className="italic" style={{ color: "var(--accent)" }}>you</span>.
      </h1>
      <p className="text-[15px] text-[color:var(--ink-soft)] leading-relaxed mt-6 max-w-[19rem] rise d2">
        The best teacher, in your pocket. It learns your strengths, your gaps and your
        habits — across any subject, any level, all the way to your exam.
      </p>

      <div className="mt-8 flex flex-col gap-2.5 rise d3">
        {[
          ["📚", "Any subject, any level", "Primary to university"],
          ["📸", "Upload anything", "Notes, PDFs, past papers, a photo"],
          ["📈", "It remembers your gaps", "Spaced review, right before you'd forget"],
        ].map(([icon, t, s]) => (
          <div key={t} className="flex items-center gap-3 py-2 border-b border-[color:var(--line)]">
            <span className="text-xl w-7 text-center">{icon}</span>
            <div>
              <p className="font-semibold text-sm">{t}</p>
              <p className="text-xs text-[color:var(--ink-faint)]">{s}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-8 rise d4">
        <Link href="/login" className="btn w-full text-base">
          Start learning →
        </Link>
        <p className="text-center text-xs text-[color:var(--ink-faint)] mt-3">
          Free, no limits · Cambridge SC & HSC ready
        </p>
      </div>
    </main>
  );
}
