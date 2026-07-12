"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import XpHeader from "@/components/XpHeader";

type Course = { course_id: string; courses: { subject: string; emoji: string } | null };
type Row = {
  topic_id: string;
  score: number;
  attempts: number;
  topics: { name: string; unit: string; sort: number; course_id: string } | null;
};

// mastery colour scale — muted paper → confident cobalt
function color(s: number) {
  if (s >= 75) return "#2438e0";
  if (s >= 50) return "#5b6fe8";
  if (s >= 30) return "#c9971f";
  return "#d8613a";
}

export default function Progress() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ xp: number; streak: number } | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [active, setActive] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState(""); // shown inline if clipboard fails
  const [report, setReport] = useState<{ strengths: string; watch: string; next: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMsg, setReportMsg] = useState("");

  async function genReport() {
    setReportBusy(true);
    setReportMsg("");
    setReport(null);
    try {
      const res = await fetch("/api/report/examiner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: active }),
      });
      const data = await res.json();
      if (data?.error === "no_data")
        setReportMsg("Do some exam practice first — then I can write your report.");
      else if (!res.ok || !data?.ok)
        setReportMsg("Could not write your report just now. Try again in a moment.");
      else setReport(data.report);
    } catch {
      setReportMsg("Could not write your report just now. Try again in a moment.");
    } finally {
      setReportBusy(false);
    }
  }

  async function share() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("share_token")
      .eq("id", user.id)
      .single();
    if (!data?.share_token) return;
    const url = `${window.location.origin}/report?t=${data.share_token}`;
    // Native share sheet (mobile) — feature-detected. A cancel throws AbortError (silent). Any
    // OTHER rejection (in-app webviews often reject Web Share) falls through to clipboard/inline
    // URL below, so the student can still get their report link.
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Pocket Teacher progress",
          text: "Here's my revision progress on Pocket Teacher 📈",
          url,
        });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // user cancelled — nothing to show
        // webview rejected Web Share — fall through to the copy fallback
      }
    }
    // Fallback (desktop / no Web Share / webview rejected) — copy the link.
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareUrl(url);
    }
  }

  useEffect(() => {
    (async () => {
      // Local session (no network) — a getUser() network blip must not bounce a valid session.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.replace("/login");
      const user = session.user;
      const { data: p } = await supabase
        .from("profiles")
        .select("xp, streak")
        .eq("id", user.id)
        .maybeSingle();
      setProfile({ xp: p?.xp ?? 0, streak: p?.streak ?? 0 });
      const { data: e } = await supabase
        .from("enrollments")
        .select("course_id, courses(subject, emoji)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const en = (e ?? []) as unknown as Course[];
      setCourses(en);
      if (en[0]) setActive(en[0].course_id);
      setLoaded(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!active) return;
    setReport(null);
    setReportMsg("");
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: topics } = await supabase.from("topics").select("id").eq("course_id", active);
      const ids = (topics ?? []).map((t) => t.id);
      if (ids.length === 0) return setRows([]);
      const { data } = await supabase
        .from("mastery")
        .select("topic_id, score, attempts, topics(name, unit, sort, course_id)")
        .eq("user_id", user.id)
        .in("topic_id", ids);
      const sorted = ((data ?? []) as unknown as Row[]).sort(
        (a, b) => (a.topics?.sort ?? 0) - (b.topics?.sort ?? 0)
      );
      setRows(sorted);
    })();
  }, [active]);

  const units = [...new Set(rows.map((r) => r.topics?.unit))].filter(Boolean) as string[];
  // Only assessed topics (attempts>0) count — a fresh user's unassessed 20-seeds must not drag
  // the average into danger-red and tell them they're failing everything.
  const assessed = rows.filter((r) => r.attempts > 0);
  const overall = assessed.length
    ? Math.round(assessed.reduce((s, r) => s + r.score, 0) / assessed.length)
    : 0;

  return (
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <div className="flex items-center justify-between gap-3 rise">
        <h1 className="display text-3xl font-semibold">Your map</h1>
        <button onClick={share} className="chip whitespace-nowrap">
          {copied ? "Link copied!" : "Share my progress →"}
        </button>
      </div>
      {shareUrl && (
        <p className="text-xs text-[color:var(--ink-faint)] break-all -mt-2 rise">{shareUrl}</p>
      )}
      {profile && <XpHeader xp={profile.xp} streak={profile.streak} />}

      {!loaded ? (
        <p className="text-[color:var(--ink-faint)] animate-pulse rise">Loading your map…</p>
      ) : courses.length === 0 ? (
        <Link href="/courses" className="card p-6 text-center text-[color:var(--ink-soft)]">
          Add a subject to start building your map →
        </Link>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 rise d1">
            {courses.map((c) => (
              <button
                key={c.course_id}
                onClick={() => setActive(c.course_id)}
                className={`chip whitespace-nowrap ${active === c.course_id ? "chip-on" : ""}`}
              >
                {c.courses?.emoji} {c.courses?.subject}
              </button>
            ))}
          </div>

          {rows.length > 0 && (
            <div className="card p-5 flex items-center justify-between rise d1">
              <div>
                <p className="eyebrow">Overall mastery</p>
                <p className="text-xs text-[color:var(--ink-faint)] mt-1">{rows.length} topics</p>
              </div>
              <p
                className="display text-4xl font-semibold"
                style={{ color: assessed.length ? color(overall) : "var(--ink-faint)" }}
              >
                {overall}
                <span className="text-xl">%</span>
              </p>
            </div>
          )}

          {units.map((unit, ui) => {
            const ur = rows.filter((r) => r.topics?.unit === unit);
            return (
              <section key={unit} className={`rise ${ui < 3 ? "d2" : ""}`}>
                <p className="eyebrow mb-2">{unit}</p>
                <div className="flex flex-col gap-2">
                  {ur.map((r) => (
                    <div key={r.topic_id} className="flex items-center gap-3">
                      <div className="flex-1 text-[13px] truncate">{r.topics?.name}</div>
                      <div className="w-24 h-1.5 rounded-full bg-[color:var(--paper-2)] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${r.score}%`,
                            // Never-assessed topics render neutral/muted, not danger-red.
                            background: r.attempts > 0 ? color(r.score) : "var(--line-strong)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          <section className="card p-5 flex flex-col gap-3 rise">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Examiner&apos;s report</p>
                <p className="text-xs text-[color:var(--ink-faint)] mt-1">
                  Written from your own answers
                </p>
              </div>
              <button onClick={genReport} disabled={reportBusy} className="chip whitespace-nowrap">
                {reportBusy ? "Reading your answers…" : report ? "Refresh" : "Generate"}
              </button>
            </div>
            {reportMsg && (
              <p className="text-[13px] text-[color:var(--ink-soft)]">{reportMsg}</p>
            )}
            {report && (
              <div className="flex flex-col gap-3">
                {([
                  ["Strengths", report.strengths],
                  ["Watch", report.watch],
                  ["Next", report.next],
                ] as const)
                  .filter(([, text]) => text)
                  .map(([label, text]) => (
                    <div key={label}>
                      <p className="eyebrow mb-1">{label}</p>
                      <p className="text-[13px] text-[color:var(--ink-soft)] whitespace-pre-line">
                        {text}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </>
      )}
      <Nav />
    </main>
  );
}
