// Tutor engine: session agenda, student snapshot, system prompt, spaced repetition,
// XP. Now course-aware and materials-aware (topics belong to a course).
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { XP } from "./levels";

// The teacher's brain lives in an editable markdown file (bundled via
// next.config outputFileTracingIncludes). Fallback keeps the tutor working if
// the file can't be read in some runtime.
let TEACHER_BRAIN = "";
try {
  TEACHER_BRAIN = readFileSync(join(process.cwd(), "src/lib/teacher.md"), "utf8");
} catch {
  TEACHER_BRAIN =
    "You are Pocket Teacher, an adaptive Mauritian tutor. Teach one small step at a time, " +
    "give a worked example, ask one question, wait, then mark the student's working. Call the " +
    "update_mastery tool after every judged attempt (gotIt true/false, exact topic_id). Keep " +
    "messages short, mirror the student's language, use plain unicode maths, never reveal you are an AI.";
}

const SURVEY_LABELS: Record<string, Record<string, string>> = {
  learning_style: {
    examples: "learns best from worked examples first",
    step_by_step: "wants slow, step-by-step explanations",
    practice: "learns by doing lots of practice questions",
    visual: "learns best with visual / real-life pictures",
  },
  struggle: {
    understanding: "struggles most with understanding concepts",
    exams_stress: "gets stressed in exams",
    time: "struggles to find time / falls behind",
    focus: "struggles to focus and stay consistent",
    motivation: "struggles with motivation",
  },
  confidence: {
    struggling: "currently feels behind and unsure",
    okay: "feels okay but wants to improve",
    confident: "feels fairly confident, aiming higher",
  },
};

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

export type Survey = {
  goal?: string;
  weekly_days?: number;
  minutes?: number;
  study_time?: string;
  learning_style?: string;
  confidence?: string;
  struggle?: string;
  motivation?: string;
};
type Profile = {
  name: string | null;
  level: string;
  language: string;
  streak: number;
  goal?: string | null;
  survey?: Survey | null;
};
type Course = { subject: string; level: string; board: string; exam_date: string | null } | null;

function surveyLines(profile: Profile): string {
  const s = profile.survey ?? {};
  const out: string[] = [];
  if (profile.goal) out.push(`Goal: ${profile.goal}`);
  if (s.learning_style && SURVEY_LABELS.learning_style[s.learning_style])
    out.push(`Learning style: ${SURVEY_LABELS.learning_style[s.learning_style]}`);
  if (s.confidence && SURVEY_LABELS.confidence[s.confidence])
    out.push(`Confidence: ${SURVEY_LABELS.confidence[s.confidence]}`);
  if (s.struggle && SURVEY_LABELS.struggle[s.struggle])
    out.push(`Biggest struggle: ${SURVEY_LABELS.struggle[s.struggle]}`);
  if (s.weekly_days || s.minutes)
    out.push(
      `Study habit: ~${s.weekly_days ?? "?"} days/week, ${s.minutes ?? "?"} min/session${s.study_time ? ` (${s.study_time})` : ""}`
    );
  if (s.motivation) out.push(`Why they study: "${s.motivation}"`);
  return out.length ? out.map((l) => `- ${l}`).join("\n") : "- (not provided yet)";
}

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

  const mat = materials
    .filter((m) => m.extracted_text)
    .map((m) => `--- ${m.filename} ---\n${(m.extracted_text ?? "").slice(0, 4000)}`)
    .join("\n\n");

  const subj = course ? `${course.subject} (${course.board}, ${course.level})` : "their subject";

  // TEACHER_BRAIN (the markdown file) + a live student-context block that adapts every turn.
  return `${TEACHER_BRAIN}

====================  THIS STUDENT (adapt to everything here)  ====================
Subject today: ${subj}
Name: ${profile.name ?? "Student"} · Streak: ${profile.streak} days${daysToExam !== null ? ` · Exam in ${daysToExam} days` : ""}

From their questionnaire:
${surveyLines(profile)}

Weakest topics (spend time here): ${weakest.join("; ") || "unknown yet — find out by asking a question"}
Known misconceptions to revisit: ${misconceptions.join("; ") || "none recorded"}

TODAY'S AGENDA:
${agenda.review.length ? `1. Quick spaced-repetition review: ${agenda.review.map((r) => `${r.name} [id: ${r.topic_id}]`).join(", ")} — one short question each.` : ""}
${agenda.focus ? `${agenda.review.length ? "2" : "1"}. Main focus: ${agenda.focus.name} [id: ${agenda.focus.topic_id}] (mastery ${agenda.focus.score}/100) — teach, then practise.` : ""}
${mat ? `\nTHE STUDENT'S OWN UPLOADED MATERIALS (teach from these — use their wording and examples):\n${mat}\n` : ""}
Now begin: greet ${profile.name ?? "the student"} by name in one line, then go straight into the agenda. Tune your teaching to their questionnaire above.`;
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

// Fallback for weaker models that won't volunteer the tool mid-conversation:
// a cheap forced-tool classification of the student's last attempt.
export async function classifyAttempt(
  client: Anthropic,
  model: string,
  supabase: SupabaseClient,
  userId: string,
  topics: { topic_id: string; name: string }[],
  studentMsg: string,
  tutorReply: string
): Promise<number> {
  if (!topics.length) return 0;
  const list = topics.map((t) => `${t.name} [id: ${t.topic_id}]`).join("; ");
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 200,
      tools: [
        {
          name: "update_mastery",
          description: "Record whether the student's last message was a correct attempt.",
          input_schema: {
            type: "object" as const,
            properties: {
              attempted: {
                type: "boolean",
                description: "true ONLY if the student was answering/attempting a question",
              },
              topic_id: { type: "string", description: "closest matching topic id from the list" },
              gotIt: { type: "boolean" },
              misconception: { type: "string" },
            },
            required: ["attempted", "topic_id", "gotIt"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "update_mastery" },
      messages: [
        {
          role: "user",
          content: `Available topics: ${list}\n\nStudent's last message: "${studentMsg}"\nTutor's reply: "${tutorReply.slice(0, 600)}"\n\nWas the student's message an attempt at answering a question in this subject? If yes, judge whether they got it right and pick the closest topic id. If it was just chatting or asking a question, set attempted=false.`,
        },
      ],
    });
    const call = res.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    const inp = call?.input as
      | { attempted?: boolean; topic_id?: string; gotIt?: boolean; misconception?: string }
      | undefined;
    if (!inp?.attempted || !inp.topic_id) return 0;
    return applyMasteryUpdate(supabase, userId, {
      topic_id: inp.topic_id,
      gotIt: !!inp.gotIt,
      misconception: inp.misconception,
    });
  } catch (e) {
    console.warn("classifyAttempt failed", e);
    return 0;
  }
}

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
