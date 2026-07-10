"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import XpHeader from "@/components/XpHeader";
import RemindersButton from "@/components/RemindersButton";
import { taskHref } from "@/lib/tasks";

type Enrolled = {
  course_id: string;
  exam_date: string | null;
  courses: { subject: string; emoji: string; level: string; board: string; exam_date: string | null } | null;
};

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<{
    name: string;
    xp: number;
    streak: number;
    reminders: boolean;
  } | null>(null);
  const [courses, setCourses] = useState<Enrolled[]>([]);
  const [due, setDue] = useState<{
    reviews: number;
    cards: number;
    tasks: { id: string; title: string; kind: string; topic_id: string | null; course_id: string }[];
  }>({ reviews: 0, cards: 0, tasks: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    setLoaded(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("name, xp, streak, onboarded, reminders")
        .eq("id", user.id)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!p?.onboarded) return router.replace("/onboarding");
      setProfile({
        name: p.name?.split(" ")[0] ?? "there",
        xp: p.xp ?? 0,
        streak: p.streak ?? 0,
        reminders: !!p.reminders,
      });
      const { data: e, error: eErr } = await supabase
        .from("enrollments")
        .select("course_id, exam_date, courses(subject, emoji, level, board, exam_date)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (eErr) throw eErr;
      const en = (e ?? []) as unknown as Enrolled[];
      // Anyone without subjects yet — including users who signed up before the questionnaire
      // existed — goes through onboarding to map the subjects they need. Only route here when
      // the read SUCCEEDED and genuinely returned nothing — a failed read throws above instead.
      if (en.length === 0) return router.replace("/onboarding");
      setCourses(en);

      // What's due TODAY — spaced-repetition reviews + scheduled plan tasks.
      const todayStr = new Date().toISOString().slice(0, 10);
      const [{ data: dueM }, { data: dueC }, { data: dueT }] = await Promise.all([
        supabase
          .from("mastery")
          .select("topic_id")
          .eq("user_id", user.id)
          .lte("review_due", todayStr)
          .gt("attempts", 0),
        supabase
          .from("flashcards")
          .select("id")
          .eq("user_id", user.id)
          .lte("review_due", todayStr),
        supabase
          .from("study_tasks")
          .select("id, title, kind, topic_id, course_id")
          .eq("user_id", user.id)
          .lte("due", todayStr)
          .eq("done", false)
          .order("due")
          .limit(3),
      ]);
      setDue({
        reviews: dueM?.length ?? 0,
        cards: dueC?.length ?? 0,
        tasks: (dueT ?? []) as {
          id: string;
          title: string;
          kind: string;
          topic_id: string | null;
          course_id: string;
        }[],
      });
      setLoaded(true);
    } catch {
      // Any thrown read/fetch — never leave the user stuck on "Loading…". Show a retry
      // instead of misrouting to onboarding on a failed profile/enrollment read.
      setError(true);
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (error)
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-[color:var(--ink-soft)]">Something went wrong</p>
        <button onClick={load} className="btn">
          Retry
        </button>
      </main>
    );

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

      {(due.reviews > 0 || due.cards > 0 || due.tasks.length > 0) && first && (
        <section className="rise d1">
          <p className="eyebrow mb-2">Today</p>
          <div className="flex flex-col gap-2">
            {due.reviews > 0 && (
              <Link
                href={`/session?course=${first.course_id}`}
                className="card px-4 py-3 flex items-center gap-3"
              >
                <span className="text-xl">🔁</span>
                <span className="text-sm flex-1 font-semibold">
                  {due.reviews} topic{due.reviews > 1 ? "s" : ""} ready to review
                </span>
                <span className="text-[color:var(--ink-faint)]">→</span>
              </Link>
            )}
            {due.cards > 0 && (
              <Link
                href={`/flashcards?course=${first.course_id}`}
                className="card px-4 py-3 flex items-center gap-3"
              >
                <span className="text-xl">🃏</span>
                <span className="text-sm flex-1 font-semibold">
                  {due.cards} flashcard{due.cards > 1 ? "s" : ""} to review
                </span>
                <span className="text-[color:var(--ink-faint)]">→</span>
              </Link>
            )}
            {due.tasks.map((t) => (
              <Link
                key={t.id}
                href={taskHref(t.kind, t.course_id, t.topic_id)}
                className="card px-4 py-3 flex items-center gap-3"
              >
                <span className="w-5 h-5 rounded-full border-2 border-[color:var(--line-strong)]" />
                <span className="text-sm flex-1">{t.title}</span>
                <span className="text-[color:var(--ink-faint)]">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {courses.length > 0 && (
        <div className="rise d1">
          <RemindersButton enabled={profile.reminders} />
        </div>
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
              // Prefer the student's own enrolment date, else fall back to the course's exam date.
              const examDate = c.exam_date ?? c.courses?.exam_date ?? null;
              const days = examDate
                ? Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)
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
                    <p className="text-[11px] mt-2 font-semibold" style={{ color: "var(--streak-text)" }}>
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
