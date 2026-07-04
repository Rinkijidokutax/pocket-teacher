import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "./ai";

// Generic forced-tool structured generation (works on the free model too).
async function forced<T>(
  toolName: string,
  schema: Record<string, unknown>,
  prompt: string,
  maxTokens = 2000
): Promise<T | null> {
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      tools: [{ name: toolName, description: `Return the ${toolName}.`, input_schema: schema as never }],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: prompt }],
    });
    const call = res.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
    return (call?.input as T) ?? null;
  } catch (e) {
    console.error("forced gen failed", toolName, e);
    return null;
  }
}

export type Flashcard = { front: string; back: string };
export async function genFlashcards(
  subject: string,
  topic: string,
  source: string | null,
  count = 10
): Promise<Flashcard[]> {
  const out = await forced<{ cards: Flashcard[] }>(
    "save_flashcards",
    {
      type: "object",
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              front: { type: "string", description: "a question or prompt" },
              back: { type: "string", description: "the concise answer" },
            },
            required: ["front", "back"],
          },
        },
      },
      required: ["cards"],
    },
    `Create ${count} active-recall flashcards for a Mauritius ${subject} student revising "${topic}". Each card: a clear question on the front, a concise correct answer on the back. Cover the key facts, definitions and methods a student must remember for exams.${
      source ? `\n\nBase them on the student's own notes:\n${source.slice(0, 6000)}` : ""
    }`
  );
  return (out?.cards ?? []).slice(0, count);
}

export type QuizQ = { q: string; options: string[]; answer: number; difficulty?: string };
export async function genQuiz(
  subject: string,
  topics: string[],
  source: string | null,
  count = 6,
  difficulty = "mixed"
): Promise<QuizQ[]> {
  const out = await forced<{ questions: QuizQ[] }>(
    "save_quiz",
    {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              q: { type: "string" },
              options: { type: "array", items: { type: "string" }, description: "exactly 4 options" },
              answer: { type: "integer", description: "index 0-3 of the correct option" },
              difficulty: { type: "string", description: "easy | medium | hard" },
            },
            required: ["q", "options", "answer"],
          },
        },
      },
      required: ["questions"],
    },
    `Write ${count} multiple-choice questions (4 options each, one correct) for a Mauritius ${subject} student on: ${topics.join(", ")}. Difficulty: ${difficulty}. Exam-style, unambiguous, with plausible distractors. Set answer to the 0-based index of the correct option.${
      source ? `\n\nGround them in the student's notes:\n${source.slice(0, 6000)}` : ""
    }`,
    2600
  );
  return (out?.questions ?? [])
    .filter((q) => q.options?.length === 4 && q.answer >= 0 && q.answer < 4)
    .slice(0, count);
}

// Adaptive diagnostic: one question per provided topic, tagged by index,
// so we can seed the mastery map per topic from the results.
export type DiagQ = { q: string; options: string[]; answer: number; topicIndex: number };
export async function genDiagnostic(
  subject: string,
  topics: string[]
): Promise<DiagQ[]> {
  const list = topics.map((t, i) => `${i}: ${t}`).join("\n");
  const out = await forced<{ questions: DiagQ[] }>(
    "save_diagnostic",
    {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              q: { type: "string" },
              options: { type: "array", items: { type: "string" }, description: "exactly 4 options" },
              answer: { type: "integer", description: "index 0-3 of correct option" },
              topicIndex: { type: "integer", description: "the topic number this question tests" },
            },
            required: ["q", "options", "answer", "topicIndex"],
          },
        },
      },
      required: ["questions"],
    },
    `Write ONE multiple-choice question (4 options, one correct) for EACH of these ${subject} topics, to gauge a Mauritius student's level. Set topicIndex to the topic number.\n\nTopics:\n${list}`,
    2600
  );
  return (out?.questions ?? []).filter(
    (q) => q.options?.length === 4 && q.answer >= 0 && q.answer < 4 && q.topicIndex >= 0
  );
}

export async function genSummary(
  subject: string,
  topic: string,
  source: string | null
): Promise<{ title: string; content: string } | null> {
  return forced<{ title: string; content: string }>(
    "save_summary",
    {
      type: "object",
      properties: {
        title: { type: "string" },
        content: {
          type: "string",
          description: "clear revision summary in plain text with short bullet-style lines",
        },
      },
      required: ["title", "content"],
    },
    `Write a tight revision summary for a Mauritius ${subject} student on "${topic}". Plain text, short lines the student can revise from — key points, definitions, formulae, common exam traps. Use unicode maths (x², √, π), no markdown headings.${
      source ? `\n\nSummarise the student's own notes:\n${source.slice(0, 8000)}` : ""
    }`,
    1500
  );
}
