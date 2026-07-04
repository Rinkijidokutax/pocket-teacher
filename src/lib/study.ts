import { anthropic, MODEL } from "./ai";

// Free models are unreliable at tool_choice and JSON, but reliable at generating
// plain text. So every generator asks for a simple line/block format and parses it
// with regex — robust across models, on the coherent MODEL (nemotron).
async function ask(prompt: string, maxTokens = 2000): Promise<string> {
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return (res.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("");
  } catch (e) {
    console.error("ask failed", e);
    return "";
  }
}

export type Flashcard = { front: string; back: string };
export async function genFlashcards(
  subject: string,
  topic: string,
  source: string | null,
  count = 10
): Promise<Flashcard[]> {
  const txt = await ask(
    `Create ${count} active-recall flashcards for a Mauritius ${subject} student revising "${topic}". Cover key facts, definitions and methods for exams.${
      source ? `\n\nBase them on the student's own notes:\n${source.slice(0, 6000)}` : ""
    }\n\nOutput EACH card on its own line in EXACTLY this format (no numbering, no other text):\nQ: <question> || A: <answer>`,
    2000
  );
  const cards: Flashcard[] = [];
  for (const line of txt.split("\n")) {
    const m = line.match(/Q:\s*(.+?)\s*\|\|\s*A:\s*(.+)/i);
    if (m) cards.push({ front: m[1].trim(), back: m[2].trim() });
  }
  return cards.slice(0, count);
}

export type QuizQ = {
  q: string;
  options: string[];
  answer: number;
  topicIndex?: number;
  explanation?: string;
};

// Reject degenerate options the free model sometimes emits (e.g. "A) A", "B) B") — a
// single letter, blanks, or duplicates. Better to drop the question than show "A. A".
function optionsOk(opts: string[]): boolean {
  if (opts.length !== 4) return false;
  const norm = opts.map((o) => o.trim().toLowerCase());
  if (norm.some((o) => o.length < 2)) return false;
  return new Set(norm).size === 4;
}

function parseQuizBlocks(txt: string, wantTopic = false): QuizQ[] {
  const out: QuizQ[] = [];
  const blocks = txt.split(/\n(?=\s*Q:)/i);
  for (const b of blocks) {
    const q = b.match(/Q:\s*(.+)/i)?.[1]?.trim();
    const opts = [...b.matchAll(/^\s*([A-D])[).]\s*(.+)$/gim)].slice(0, 4).map((m) => m[2].trim());
    const correct = b.match(/CORRECT:\s*([A-D])/i)?.[1]?.toUpperCase();
    if (!q || !correct || !optionsOk(opts)) continue;
    const answer = "ABCD".indexOf(correct);
    const item: QuizQ = { q, options: opts, answer };
    const why = b.match(/WHY:\s*(.+)/i)?.[1]?.trim();
    if (why) item.explanation = why;
    if (wantTopic) {
      const ti = b.match(/TOPIC:\s*(\d+)/i)?.[1];
      item.topicIndex = ti ? parseInt(ti, 10) : 0;
    }
    out.push(item);
  }
  return out;
}

export async function genQuiz(
  subject: string,
  topics: string[],
  source: string | null,
  count = 6,
  difficulty = "mixed"
): Promise<QuizQ[]> {
  const txt = await ask(
    `Write ${count} exam-style multiple-choice questions for a Mauritius ${subject} student on: ${topics.join(", ")}. Difficulty: ${difficulty}. Four options each, one correct, plausible distractors.${
      source ? `\n\nGround them in the student's notes:\n${source.slice(0, 6000)}` : ""
    }\n\nEvery option must be a REAL, fully written-out answer — never just the letter. Output each question as a block in EXACTLY this format, one blank line between blocks, no other text:\nQ: <question>\nA) <option>\nB) <option>\nC) <option>\nD) <option>\nCORRECT: <A, B, C or D>\nWHY: <one short sentence explaining why the correct answer is right>\n\nExample:\nQ: Which gas do plants absorb during photosynthesis?\nA) Oxygen\nB) Carbon dioxide\nC) Nitrogen\nD) Hydrogen\nCORRECT: B\nWHY: Plants take in carbon dioxide and release oxygen during photosynthesis.`,
    2600
  );
  return parseQuizBlocks(txt).slice(0, count);
}

export async function genSummary(
  subject: string,
  topic: string,
  source: string | null
): Promise<{ title: string; content: string } | null> {
  const txt = await ask(
    `Write a tight revision summary for a Mauritius ${subject} student on "${topic}". Key points, definitions, formulae, common exam traps. Plain text, unicode maths (x², √, π), no markdown.${
      source ? `\n\nSummarise the student's own notes:\n${source.slice(0, 8000)}` : ""
    }\n\nStart with a line "TITLE: <a short title>", then the summary.`,
    1500
  );
  if (!txt.trim()) return null;
  const title = txt.match(/TITLE:\s*(.+)/i)?.[1]?.trim() || topic;
  const content = txt.replace(/^[\s\S]*?TITLE:.*(?:\n|$)/i, "").trim() || txt.trim();
  return { title, content };
}

export type DiagQ = { q: string; options: string[]; answer: number; topicIndex: number };
export async function genDiagnostic(subject: string, topics: string[]): Promise<DiagQ[]> {
  const list = topics.map((t, i) => `${i}: ${t}`).join("\n");
  const prompt = `Write ONE multiple-choice question for EACH of these ${subject} topics, to gauge a Mauritius student's level. Four options each, one correct.\n\nTopics:\n${list}\n\nEvery option must be a REAL, fully written-out answer — never just the letter. Output each as a block in EXACTLY this format, one blank line between blocks, no other text:\nQ: <question>\nA) <option>\nB) <option>\nC) <option>\nD) <option>\nCORRECT: <A, B, C or D>\nTOPIC: <the topic number>\n\nExample:\nQ: Which gas do plants absorb during photosynthesis?\nA) Oxygen\nB) Carbon dioxide\nC) Nitrogen\nD) Hydrogen\nCORRECT: B\nTOPIC: 0`;
  let parsed = parseQuizBlocks(await ask(prompt, 2600), true);
  // Free models sometimes emit placeholder options that the guard drops — retry once.
  if (parsed.length < Math.min(3, topics.length))
    parsed = parseQuizBlocks(await ask(prompt, 2600), true);
  return parsed.map((q) => ({
    q: q.q,
    options: q.options,
    answer: q.answer,
    topicIndex: q.topicIndex ?? 0,
  }));
}

export type SyllabusOut = {
  subject: string;
  level: string;
  board?: string;
  emoji?: string;
  topics: { unit: string; name: string }[];
};
export async function genSyllabus(text: string): Promise<SyllabusOut | null> {
  const txt = await ask(
    `Extract the topic tree from this course syllabus — every teachable topic, grouped into units, in order. If sparse, expand into the standard topics a student at that level would need.\n\n${text.slice(0, 30000)}\n\nOutput a first line "META: <subject> | <level> | <emoji>" where level is one of primary, nce, o_level, hsc, university, self. Then each topic on its own line as "<unit> | <topic>". No other text.`,
    3200
  );
  if (!txt.trim()) return null;
  const meta = txt.match(/META:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)/i);
  const topics: { unit: string; name: string }[] = [];
  for (const line of txt.split("\n")) {
    if (/^\s*META:/i.test(line)) continue;
    const m = line.match(/^\s*(.+?)\s*\|\s*(.+?)\s*$/);
    if (m && !/META:/i.test(m[1])) topics.push({ unit: m[1].trim(), name: m[2].trim() });
  }
  if (!topics.length) return null;
  return {
    subject: meta?.[1]?.trim() || "My course",
    level: (meta?.[2]?.trim() || "self").toLowerCase().replace(/[^a-z_]/g, "") || "self",
    board: "Custom",
    emoji: meta?.[3]?.trim().slice(0, 4) || "📘",
    topics,
  };
}
