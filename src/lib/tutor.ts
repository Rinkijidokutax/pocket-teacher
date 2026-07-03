// Tutor engine: session agenda, student snapshot, system prompt, spaced repetition.
import type { SupabaseClient } from "@supabase/supabase-js";

export type MasteryRow = {
  topic_id: string;
  score: number;
  attempts: number;
  interval_days: number;
  review_due: string | null;
  misconceptions: string[];
  syllabus_topics: { name: string; unit: string } | null;
};

export type Agenda = {
  review: { topic_id: string; name: string; score: number }[];
  focus: { topic_id: string; name: string; unit: string; score: number } | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export async function buildAgenda(supabase: SupabaseClient, userId: string): Promise<Agenda> {
  const { data } = await supabase
    .from("mastery")
    .select("topic_id, score, attempts, interval_days, review_due, misconceptions, syllabus_topics(name, unit)")
    .eq("user_id", userId)
    .order("score", { ascending: true });
  const rows = (data ?? []) as unknown as MasteryRow[];

  const due = rows
    .filter((r) => r.review_due && r.review_due <= today() && r.attempts > 0)
    .slice(0, 2)
    .map((r) => ({ topic_id: r.topic_id, name: r.syllabus_topics?.name ?? r.topic_id, score: r.score }));

  const focusRow = rows.find((r) => !due.some((d) => d.topic_id === r.topic_id));
  const focus = focusRow
    ? {
        topic_id: focusRow.topic_id,
        name: focusRow.syllabus_topics?.name ?? focusRow.topic_id,
        unit: focusRow.syllabus_topics?.unit ?? "",
        score: focusRow.score,
      }
    : null;

  return { review: due, focus };
}

// SM-2-ish: correct → grow interval, wrong → reset.
// ponytail: basic SM-2, upgrade to FSRS if retention data warrants
export function nextReview(intervalDays: number, gotIt: boolean): { interval_days: number; review_due: string } {
  const interval = gotIt ? Math.min(Math.round(intervalDays * 2.2) || 1, 60) : 1;
  const d = new Date();
  d.setDate(d.getDate() + interval);
  return { interval_days: interval, review_due: d.toISOString().slice(0, 10) };
}

type Profile = {
  name: string | null;
  level: string;
  language: string;
  exam_date: string | null;
  goal: string | null;
  streak: number;
};

export function systemPrompt(profile: Profile, agenda: Agenda, mastery: MasteryRow[]): string {
  const weakest = mastery
    .slice(0, 5)
    .map((m) => `${m.syllabus_topics?.name ?? m.topic_id} [id: ${m.topic_id}] (${m.score}/100)`);
  const misconceptions = mastery
    .flatMap((m) => (m.misconceptions ?? []).map((x) => `${m.syllabus_topics?.name}: ${x}`))
    .slice(0, 6);
  const daysToExam = profile.exam_date
    ? Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000)
    : null;

  return `You are Pocket Teacher — the best private tutor in Mauritius, in the student's pocket. You teach Cambridge O-Level Mathematics (4024) to a student preparing for School Certificate.

STUDENT
- Name: ${profile.name ?? "Student"} · Streak: ${profile.streak} days${daysToExam !== null ? ` · Exam in ${daysToExam} days` : ""}
- Goal: ${profile.goal ?? "pass the exam well"}
- Weakest topics: ${weakest.join("; ") || "unknown yet"}
- Known misconceptions: ${misconceptions.join("; ") || "none recorded"}

TODAY'S AGENDA (follow it, but bend to the student's questions)
${agenda.review.length ? `1. Quick review (spaced repetition): ${agenda.review.map((r) => `${r.name} [id: ${r.topic_id}]`).join(", ")} — 1 short question each.` : ""}
${agenda.focus ? `${agenda.review.length ? "2" : "1"}. Main focus: ${agenda.focus.name} [id: ${agenda.focus.topic_id}] (current mastery ${agenda.focus.score}/100) — teach, then practise.` : ""}

HOW YOU TEACH
- Socratic and warm. Short messages (this is a phone). One question at a time, wait for their answer.
- Teach in small steps: brief explanation → worked example → ask them to try one.
- When they answer, mark their working line by line. Praise what's right, pinpoint exactly where it went wrong, never just give the answer.
- If an explanation doesn't land, re-explain a different way (visual, real-life Mauritian examples — rupees, ratios at the bazaar, distances between towns).
- Mirror the student's language: reply in English or French to match them (Kreol-friendly). Keep maths notation standard.
- Use plain text and unicode maths (x², ½, √, π). No LaTeX, no markdown headers or tables.

MASTERY TRACKING (critical — this is how you remember the student)
Every time the student attempts a question and you judge it right or wrong, you MUST call the update_mastery tool in that same reply — do not skip it, even for quick or partial attempts. gotIt=true if they showed real understanding, false otherwise. Include a short misconception note when they reveal one (e.g. "adds indices when multiplying powers of different bases"). Call it silently — never mention the tool or scores unless asked. If you failed to record an attempt, your memory of this student is lost.

Start the session by greeting them by name in one line and going straight into the agenda.`;
}

export const MASTERY_TOOL = {
  name: "update_mastery",
  description:
    "Record the result of a student attempt on a topic. Call after each judged attempt.",
  input_schema: {
    type: "object" as const,
    properties: {
      topic_id: {
        type: "string",
        description:
          "exact topic id shown in [id: ...] in your instructions, e.g. alg.quadratics — never invent one",
      },
      gotIt: { type: "boolean", description: "true if the attempt showed understanding" },
      misconception: { type: "string", description: "short note of misconception revealed, if any" },
    },
    required: ["topic_id", "gotIt"],
  },
};

export async function applyMasteryUpdate(
  supabase: SupabaseClient,
  userId: string,
  input: { topic_id: string; gotIt: boolean; misconception?: string }
) {
  const { data: row } = await supabase
    .from("mastery")
    .select("score, attempts, interval_days, misconceptions")
    .eq("user_id", userId)
    .eq("topic_id", input.topic_id)
    .maybeSingle();
  if (!row) {
    console.warn("update_mastery: unknown topic_id", input.topic_id);
    return;
  }

  const delta = input.gotIt ? Math.max(3, Math.round((100 - row.score) * 0.12)) : -Math.max(2, Math.round(row.score * 0.08));
  const misconceptions: string[] = [...(row.misconceptions ?? [])];
  if (input.misconception) {
    misconceptions.push(input.misconception);
    while (misconceptions.length > 8) misconceptions.shift();
  }
  await supabase
    .from("mastery")
    .update({
      score: Math.max(0, Math.min(100, row.score + delta)),
      attempts: row.attempts + 1,
      last_reviewed: new Date().toISOString(),
      misconceptions,
      ...nextReview(row.interval_days, input.gotIt),
    })
    .eq("user_id", userId)
    .eq("topic_id", input.topic_id);
}
