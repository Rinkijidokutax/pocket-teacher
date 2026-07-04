// Tutor engine: session agenda, student snapshot, system prompt, spaced repetition,
// XP. Now course-aware and materials-aware (topics belong to a course).
import type { SupabaseClient } from "@supabase/supabase-js";
import { XP } from "./levels";

export type MasteryRow = {
  topic_id: string;
  score: number;
  attempts: number;
  interval_days: number;
  review_due: string | null;
  misconceptions: string[];
  topics: { name: string; unit: string; course_id: string } | null;
};

export type Agenda = {
  review: { topic_id: string; name: string; score: number }[];
  focus: { topic_id: string; name: string; unit: string; score: number } | null;
};

const today = () => new Date().toISOString().slice(0, 10);

// Fetch mastery rows for a user, optionally scoped to one course.
export async function loadMastery(
  supabase: SupabaseClient,
  userId: string,
  courseId?: string | null
): Promise<MasteryRow[]> {
  let topicIds: string[] | null = null;
  if (courseId) {
    const { data: t } = await supabase
      .from("topics")
      .select("id")
      .eq("course_id", courseId);
    topicIds = (t ?? []).map((r) => r.id);
    if (topicIds.length === 0) return [];
  }
  let q = supabase
    .from("mastery")
    .select(
      "topic_id, score, attempts, interval_days, review_due, misconceptions, topics(name, unit, course_id)"
    )
    .eq("user_id", userId)
    .order("score", { ascending: true });
  if (topicIds) q = q.in("topic_id", topicIds);
  const { data } = await q;
  return (data ?? []) as unknown as MasteryRow[];
}

export function buildAgenda(rows: MasteryRow[]): Agenda {
  const due = rows
    .filter((r) => r.review_due && r.review_due <= today() && r.attempts > 0)
    .slice(0, 2)
    .map((r) => ({ topic_id: r.topic_id, name: r.topics?.name ?? r.topic_id, score: r.score }));

  const focusRow = rows.find((r) => !due.some((d) => d.topic_id === r.topic_id));
  const focus = focusRow
    ? {
        topic_id: focusRow.topic_id,
        name: focusRow.topics?.name ?? focusRow.topic_id,
        unit: focusRow.topics?.unit ?? "",
        score: focusRow.score,
      }
    : null;

  return { review: due, focus };
}

// SM-2-ish spacing. ponytail: basic SM-2, upgrade to FSRS if retention data warrants
export function nextReview(intervalDays: number, gotIt: boolean) {
  const interval = gotIt ? Math.min(Math.round(intervalDays * 2.2) || 1, 60) : 1;
  const d = new Date();
  d.setDate(d.getDate() + interval);
  return { interval_days: interval, review_due: d.toISOString().slice(0, 10) };
}

type Profile = {
  name: string | null;
  level: string;
  language: string;
  streak: number;
};
type Course = { subject: string; level: string; board: string; exam_date: string | null } | null;

export function systemPrompt(
  profile: Profile,
  course: Course,
  agenda: Agenda,
  mastery: MasteryRow[],
  materials: { filename: string; extracted_text: string | null }[]
): string {
  const weakest = mastery
    .slice(0, 6)
    .map((m) => `${m.topics?.name ?? m.topic_id} [id: ${m.topic_id}] (${m.score}/100)`);
  const misconceptions = mastery
    .flatMap((m) => (m.misconceptions ?? []).map((x) => `${m.topics?.name}: ${x}`))
    .slice(0, 6);
  const daysToExam = course?.exam_date
    ? Math.ceil((new Date(course.exam_date).getTime() - Date.now()) / 86400000)
    : null;

  // uploaded materials, truncated so the snapshot stays compact
  const mat = materials
    .filter((m) => m.extracted_text)
    .map((m) => `--- ${m.filename} ---\n${(m.extracted_text ?? "").slice(0, 4000)}`)
    .join("\n\n");

  const subj = course ? `${course.subject} (${course.board}, ${course.level})` : "their subject";

  return `You are Pocket Teacher — the best private tutor in Mauritius, in the student's pocket. You teach ${subj}.

STUDENT
- Name: ${profile.name ?? "Student"} · Streak: ${profile.streak} days${daysToExam !== null ? ` · Exam in ${daysToExam} days` : ""}
- Weakest topics: ${weakest.join("; ") || "unknown yet — find out by asking a question"}
- Known misconceptions: ${misconceptions.join("; ") || "none recorded"}

TODAY'S AGENDA (follow it, but bend to the student's questions)
${agenda.review.length ? `1. Quick spaced-repetition review: ${agenda.review.map((r) => `${r.name} [id: ${r.topic_id}]`).join(", ")} — one short question each.` : ""}
${agenda.focus ? `${agenda.review.length ? "2" : "1"}. Main focus: ${agenda.focus.name} [id: ${agenda.focus.topic_id}] (mastery ${agenda.focus.score}/100) — teach, then practise.` : ""}

HOW YOU TEACH
- Socratic and warm. Short messages (this is a phone). One question at a time, then wait.
- Small steps: brief explanation → worked example → ask them to try one.
- Mark their working line by line. Praise what's right, pinpoint the exact slip, never just hand over the answer.
- If an explanation doesn't land, re-explain a different way — real Mauritian examples (rupees, the bazaar, distances between towns).
- Mirror the student's language (English / French / Kreol-friendly). Standard maths notation, plain unicode (x², ½, √, π). No LaTeX, no markdown tables.
${mat ? `\nTHE STUDENT'S OWN MATERIALS (they uploaded these — teach from them, quote them, use their exact notation and examples):\n${mat}\n` : ""}
MASTERY TRACKING (critical — this is how you remember the student)
Every time the student attempts a question and you judge it right or wrong, you MUST call the update_mastery tool in that same reply — never skip it. gotIt=true if they showed real understanding, false otherwise. Add a short misconception note when they reveal one. Use the exact topic id shown in [id: ...]. Call it silently; never mention the tool or scores unless asked. If no topic id fits, pick the closest weak topic's id.

Start by greeting them by name in one line, then go straight into the agenda.`;
}

export const MASTERY_TOOL = {
  name: "update_mastery",
  description: "Record the result of a student attempt on a topic. Call after each judged attempt.",
  input_schema: {
    type: "object" as const,
    properties: {
      topic_id: {
        type: "string",
        description: "exact topic id shown in [id: ...] in your instructions — never invent one",
      },
      gotIt: { type: "boolean", description: "true if the attempt showed understanding" },
      misconception: { type: "string", description: "short note of a misconception, if any" },
    },
    required: ["topic_id", "gotIt"],
  },
};

// Applies an update and returns XP earned for it.
export async function applyMasteryUpdate(
  supabase: SupabaseClient,
  userId: string,
  input: { topic_id: string; gotIt: boolean; misconception?: string }
): Promise<number> {
  const { data: row } = await supabase
    .from("mastery")
    .select("score, attempts, interval_days, misconceptions")
    .eq("user_id", userId)
    .eq("topic_id", input.topic_id)
    .maybeSingle();
  if (!row) {
    console.warn("update_mastery: unknown topic_id", input.topic_id);
    return 0;
  }
  const delta = input.gotIt
    ? Math.max(3, Math.round((100 - row.score) * 0.12))
    : -Math.max(2, Math.round(row.score * 0.08));
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
  return input.gotIt ? XP.correct : XP.attempt;
}
