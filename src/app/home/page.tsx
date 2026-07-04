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
        <p className="text-slate-400 animate-pulse">Loading…</p>
      </main>
    );

  const first = courses[0];

  return (
    <main className="flex-1 px-5 pt-12 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Hi {profile.name} 👋</h1>
          <p className="text-slate-400 text-sm">Let&apos;s keep the streak alive.</p>
        </div>
        <button
          className="text-[11px] text-slate-500"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/");
          }}
        >
          Sign out
        </button>
      </header>

      <XpHeader name={profile.name} xp={profile.xp} streak={profile.streak} />

      {first && (
        <Link
          href={`/session?course=${first.course_id}`}
          className="btn text-lg py-5 pop"
        >
          <span className="text-2xl mr-1">{first.courses?.emoji}</span>
          Start today&apos;s {first.courses?.subject} lesson →
        </Link>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-300">My subjects</h2>
          <Link href="/courses" className="text-xs text-fuchsia-300 font-semibold">
            + Add
          </Link>
        </div>
        {courses.length === 0 ? (
          <Link href="/courses" className="card p-5 block text-center text-slate-300">
            <p className="text-3xl mb-1">➕</p>
            Add your first subject to begin
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {courses.map((c) => {
              const days = c.exam_date
                ? Math.ceil((new Date(c.exam_date).getTime() - Date.now()) / 86400000)
                : null;
              return (
                <Link
                  key={c.course_id}
                  href={`/session?course=${c.course_id}`}
                  className="card p-4 active:scale-[0.97] transition"
                >
                  <div className="text-3xl">{c.courses?.emoji}</div>
                  <p className="font-bold text-sm mt-1.5 leading-tight">
                    {c.courses?.subject}
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                    {c.courses?.board}
                  </p>
                  {days !== null && (
                    <p className="text-[11px] text-amber-300 mt-1">📅 {days}d to exam</p>
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
