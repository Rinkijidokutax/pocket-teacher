"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import XpHeader from "@/components/XpHeader";

type Enrolled = {
  course_id: string;
  exam_date: string | null;
  courses: { subject: string; emoji: string; level: string; board: string } | null;
};

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ name: string; xp: number; streak: number } | null>(null);
  const [courses, setCourses] = useState<Enrolled[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: p } = await supabase
        .from("profiles")
        .select("name, xp, streak, onboarded")
        .eq("id", user.id)
        .maybeSingle();
      if (!p?.onboarded) return router.replace("/onboarding");
      setProfile({ name: p.name?.split(" ")[0] ?? "there", xp: p.xp ?? 0, streak: p.streak ?? 0 });
      const { data: e } = await supabase
        .from("enrollments")
        .select("course_id, exam_date, courses(subject, emoji, level, board)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      setCourses((e ?? []) as unknown as Enrolled[]);
      setLoaded(true);
    })();
  }, [router]);

  if (!loaded || !profile)
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[color:var(--ink-faint)] animate-pulse">Loading…</p>
      </main>
    );

  const first = courses[0];
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <header className="flex items-end justify-between rise">
        <div>
          <p className="eyebrow">{greeting}</p>
          <h1 className="display text-3xl font-semibold mt-1">{profile.name}</h1>
        </div>
        <button
          className="text-[11px] text-[color:var(--ink-faint)] underline underline-offset-2"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/");
          }}
        >
          Sign out
        </button>
      </header>

      <XpHeader xp={profile.xp} streak={profile.streak} />

      {first && (
        <Link href={`/session?course=${first.course_id}`} className="btn text-base py-5 rise d1">
          <span className="text-xl mr-1">{first.courses?.emoji}</span>
          Continue {first.courses?.subject} →
        </Link>
      )}

      <section className="rise d2">
        <div className="flex items-center justify-between mb-2.5">
          <p className="eyebrow">My subjects</p>
          <Link href="/courses" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
            + Add subject
          </Link>
        </div>
        {courses.length === 0 ? (
          <Link href="/courses" className="card p-6 block text-center text-[color:var(--ink-soft)]">
            <p className="text-2xl mb-1">＋</p>
            Add your first subject to begin
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {courses.map((c) => {
              const days = c.exam_date
                ? Math.ceil((new Date(c.exam_date).getTime() - Date.now()) / 86400000)
                : null;
              return (
                <Link
                  key={c.course_id}
                  href={`/session?course=${c.course_id}`}
                  className="card p-4 transition hover:-translate-y-0.5"
                >
                  <div className="text-2xl">{c.courses?.emoji}</div>
                  <p className="font-semibold text-sm mt-2 leading-tight">{c.courses?.subject}</p>
                  <p className="eyebrow mt-0.5">{c.courses?.board}</p>
                  {days !== null && (
                    <p className="text-[11px] mt-2 font-semibold" style={{ color: "var(--streak)" }}>
                      {days}d to exam
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <Nav />
    </main>
  );
}
