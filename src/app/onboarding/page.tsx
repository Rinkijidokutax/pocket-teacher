"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { LADDER } from "@/lib/ladder";
import { enablePush } from "@/components/RemindersButton";

type Course = { id: string; subject: string; emoji: string; board: string };
const STEPS = 6;

function Pick({
  options,
  value,
  onChange,
  cols = 2,
}: {
  options: { id: string; label: string; sub?: string }[];
  value: string;
  onChange: (v: string) => void;
  cols?: number;
}) {
  return (
    <div className={`grid gap-2 ${cols === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`tile ${value === o.id ? "tile-on" : ""} px-4 py-3 text-left`}
        >
          <p className="font-semibold text-sm">{o.label}</p>
          {o.sub && <p className="text-xs text-[color:var(--ink-faint)]">{o.sub}</p>}
        </button>
      ))}
    </div>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [level, setLevel] = useState("");
  const [language, setLanguage] = useState("en");
  const [courses, setCourses] = useState<Course[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [goal, setGoal] = useState("");
  const [examDate, setExamDate] = useState("");
  const [weeklyDays, setWeeklyDays] = useState("4");
  const [minutes, setMinutes] = useState("30");
  const [studyTime, setStudyTime] = useState("");
  const [learningStyle, setLearningStyle] = useState("");
  const [struggle, setStruggle] = useState("");
  const [confidence, setConfidence] = useState("");
  const [motivation, setMotivation] = useState("");
  const [coursesLoading, setCoursesLoading] = useState(false);

  const loadCourses = () => {
    setCoursesLoading(true);
    supabase
      .from("courses")
      .select("id, subject, emoji, board")
      .eq("is_template", true)
      .eq("level", level)
      .order("subject")
      .then(({ data, error }) => {
        setCoursesLoading(false);
        setCourses(error ? [] : data ?? []);
      });
  };

  useEffect(() => {
    if (step !== 2 || !level) return;
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, level]);

  function toggle(id: string) {
    const n = new Set(picked);
    n.has(id) ? n.delete(id) : n.add(id);
    setPicked(n);
  }

  async function finish() {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const survey = {
        goal,
        weekly_days: weeklyDays ? Number(weeklyDays) : null,
        minutes: minutes ? Number(minutes) : null,
        study_time: studyTime || null,
        learning_style: learningStyle || null,
        struggle: struggle || null,
        confidence: confidence || null,
        motivation: motivation || null,
      };
      // Enroll FIRST — only commit onboarded=true once at least one subject lands, or the
      // student can end up onboarded with zero subjects and bounce home <-> onboarding.
      const ok = await Promise.all(
        [...picked].map((courseId) => {
          // Never hang on a stalled connection — cap each enroll at 20s, then fail it.
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 20000);
          return fetch("/api/courses/enroll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseId, examDate: examDate || null }),
            signal: ctrl.signal,
          })
            .then((r) => r.ok)
            .catch(() => false)
            .finally(() => clearTimeout(to));
        })
      );
      if (!ok.some(Boolean)) {
        alert("Couldn’t set up your subjects — check your connection and tap “Start learning” again.");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          level,
          language,
          goal: goal || null,
          exam_date: examDate || null,
          survey,
          onboarded: true,
        })
        .eq("id", user.id);
      if (error) {
        alert("Couldn’t save your profile — check your connection and tap “Start learning” again.");
        return;
      }
      // Straight to the app — don't block first value behind a multi-subject AI diagnostic
      // (minutes on the free model). Mastery seeds at baseline; the tutor adapts from lesson 1.
      router.replace("/home");
    } finally {
      setBusy(false);
    }
  }

  // Fire the reminders opt-in (if chosen) at peak intent, then finish. Never block finishing
  // on it — a permission dialog or a service worker that never becomes ready must not trap the
  // student in onboarding, so cap the wait and proceed regardless of the result.
  async function finishWithReminders(withPush: boolean) {
    setBusy(true);
    if (withPush)
      await Promise.race([
        enablePush(),
        new Promise<boolean>((r) => setTimeout(() => r(false), 8000)),
      ]);
    await finish();
  }

  const canNext =
    (step === 1 && level) ||
    (step === 2 && picked.size > 0) ||
    (step === 3 && goal) ||
    step === 4 ||
    step === 5;

  return (
    <main className="flex-1 flex flex-col px-7 max-w-md mx-auto w-full min-h-screen py-12 gap-6">
      <div className="flex items-center gap-3">
        <span className="eyebrow">Step {step} of {STEPS}</span>
        <div className="flex gap-1.5 flex-1">
          {Array.from({ length: STEPS }, (_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition"
              style={{ background: i < step ? "var(--accent)" : "var(--line-strong)" }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        {step === 1 && (
          <>
            <h1 className="display text-4xl font-semibold rise">
              Where are you
              <br />
              in your studies?
            </h1>
            <div className="flex flex-col gap-2 rise d1">
              {LADDER.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLevel(l.id)}
                  className={`tile ${level === l.id ? "tile-on" : ""} flex items-center gap-3 px-4 py-3.5 text-left`}
                >
                  <span className="text-2xl">{l.emoji}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-[15px]">{l.label}</p>
                    <p className="text-xs text-[color:var(--ink-faint)]">{l.hint}</p>
                  </div>
                  {level === l.id && <span style={{ color: "var(--accent)" }}>●</span>}
                </button>
              ))}
            </div>
            <div className="rise d2">
              <p className="eyebrow mb-2">Language</p>
              <Pick
                options={[
                  { id: "en", label: "English" },
                  { id: "fr", label: "Français" },
                ]}
                value={language}
                onChange={setLanguage}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="display text-4xl font-semibold rise">Your subjects</h1>
            <p className="text-sm text-[color:var(--ink-soft)] -mt-2 rise">
              Pick what you&apos;re studying. Add more or upload your own syllabus later.
            </p>
            <div className="grid grid-cols-2 gap-2.5 rise d1">
              {courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`tile ${picked.has(c.id) ? "tile-on" : ""} p-3.5 text-left`}
                >
                  <div className="text-2xl">{c.emoji}</div>
                  <p className="font-semibold text-sm mt-1.5 leading-tight">{c.subject}</p>
                  <p className="text-[10px] text-[color:var(--ink-faint)] uppercase">{c.board}</p>
                </button>
              ))}
            </div>
            {courses.length === 0 && coursesLoading && (
              <p className="text-[color:var(--ink-faint)] text-sm">Loading subjects…</p>
            )}
            {courses.length === 0 && !coursesLoading && (
              <div className="flex flex-col gap-2 rise">
                <p className="text-[color:var(--ink-faint)] text-sm">Couldn&apos;t load subjects.</p>
                <button onClick={loadCourses} className="btn-ghost">
                  Retry
                </button>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="display text-4xl font-semibold rise">What&apos;s your goal?</h1>
            <div className="rise d1">
              <Pick
                cols={1}
                options={[
                  { id: "Pass the exam", label: "Just pass", sub: "Get over the line" },
                  { id: "Get a credit", label: "Get a credit", sub: "A solid grade" },
                  { id: "Top grade (A / distinction)", label: "Top grade", sub: "Aim for an A" },
                  { id: "Catch up / build confidence", label: "Catch up", sub: "Fill my gaps" },
                ]}
                value={goal}
                onChange={setGoal}
              />
            </div>
            <div className="rise d2">
              <p className="eyebrow mb-2">Exam date (optional)</p>
              <input
                type="date"
                className="input"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="display text-4xl font-semibold rise">Your study habits</h1>
            <p className="text-sm text-[color:var(--ink-soft)] -mt-2 rise">
              So your teacher fits around your real life.
            </p>
            <div className="rise d1">
              <p className="eyebrow mb-2">Days per week</p>
              <div className="flex gap-1.5">
                {["1", "2", "3", "4", "5", "6", "7"].map((d) => (
                  <button
                    key={d}
                    onClick={() => setWeeklyDays(d)}
                    className={`tile ${weeklyDays === d ? "tile-on" : ""} flex-1 py-2.5 font-semibold text-sm`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="rise d2">
              <p className="eyebrow mb-2">Minutes per session</p>
              <Pick
                options={[
                  { id: "15", label: "15 min" },
                  { id: "30", label: "30 min" },
                  { id: "45", label: "45 min" },
                  { id: "60", label: "60+ min" },
                ]}
                value={minutes}
                onChange={setMinutes}
              />
            </div>
            <div className="rise d3">
              <p className="eyebrow mb-2">Best time to study</p>
              <Pick
                options={[
                  { id: "morning", label: "☀️ Morning" },
                  { id: "afternoon", label: "🌤 Afternoon" },
                  { id: "evening", label: "🌆 Evening" },
                  { id: "night", label: "🌙 Night" },
                ]}
                value={studyTime}
                onChange={setStudyTime}
              />
            </div>
            <button
              onClick={() => setStep(step + 1)}
              className="text-xs text-[color:var(--ink-faint)] underline self-start rise"
            >
              Skip — set this later
            </button>
          </>
        )}

        {step === 5 && (
          <>
            <h1 className="display text-4xl font-semibold rise">How you learn</h1>
            <div className="rise d1">
              <p className="eyebrow mb-2">You learn best by…</p>
              <Pick
                cols={1}
                options={[
                  { id: "examples", label: "Seeing worked examples first" },
                  { id: "step_by_step", label: "Slow, step-by-step explanations" },
                  { id: "practice", label: "Doing lots of practice questions" },
                  { id: "visual", label: "Pictures & real-life examples" },
                ]}
                value={learningStyle}
                onChange={setLearningStyle}
              />
            </div>
            <div className="rise d2">
              <p className="eyebrow mb-2">Your biggest struggle</p>
              <Pick
                options={[
                  { id: "understanding", label: "Understanding" },
                  { id: "exams_stress", label: "Exam stress" },
                  { id: "time", label: "Finding time" },
                  { id: "focus", label: "Staying focused" },
                  { id: "motivation", label: "Motivation" },
                ]}
                value={struggle}
                onChange={setStruggle}
              />
            </div>
            <div className="rise d3">
              <p className="eyebrow mb-2">Right now you feel…</p>
              <Pick
                cols={1}
                options={[
                  { id: "struggling", label: "Behind and unsure" },
                  { id: "okay", label: "Okay, but want to improve" },
                  { id: "confident", label: "Confident, aiming higher" },
                ]}
                value={confidence}
                onChange={setConfidence}
              />
            </div>
            <button
              onClick={() => setStep(step + 1)}
              className="text-xs text-[color:var(--ink-faint)] underline self-start rise"
            >
              Skip — set this later
            </button>
          </>
        )}

        {step === 6 && (
          <>
            <h1 className="display text-4xl font-semibold rise">Stay on track</h1>
            <p className="text-sm text-[color:var(--ink-soft)] -mt-2 rise">
              Want a nudge at your study time so you don&apos;t lose your streak?
            </p>
            <div className="flex flex-col gap-2 rise d1">
              <button
                onClick={() => finishWithReminders(true)}
                disabled={busy}
                className="btn"
              >
                {busy ? "Setting up…" : "🔔 Enable reminders"}
              </button>
              <button
                onClick={() => finishWithReminders(false)}
                disabled={busy}
                className="btn-ghost"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2">
        {step > 1 && (
          <button onClick={() => setStep(step - 1)} disabled={busy} className="btn-ghost flex-1">
            Back
          </button>
        )}
        {step < STEPS && (
          <button disabled={!canNext} onClick={() => setStep(step + 1)} className="btn flex-[2]">
            Continue →
          </button>
        )}
      </div>
    </main>
  );
}
