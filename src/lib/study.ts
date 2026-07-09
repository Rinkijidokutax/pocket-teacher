import { complete } from "./ai";

// Free models are unreliable at tool_choice and JSON, but reliable at generating
// plain text. So every generator asks for a simple line/block format and parses it
// with regex. complete() adds cross-model fallback — if one free model is down or
// rate-limited, the next in the chain answers, with identical instructions.
async function ask(prompt: string, maxTokens = 2000): Promise<string> {
  const { text } = await complete([{ role: "user", content: prompt }], maxTokens);
  return text;
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
  difficulty = "mixed",
  exam = ""
): Promise<QuizQ[]> {
  const examLine = exam
    ? ` Write them in the real ${exam} exam style — use the exam's command words (State, Define, Describe, Explain, Calculate, Evaluate) and mark-scheme-level precision.`
    : "";
  const txt = await ask(
    `Write ${count} exam-style multiple-choice questions for a Mauritius ${subject} student on: ${topics.join(", ")}. Difficulty: ${difficulty}.${examLine} Four options each, one correct, plausible distractors.${
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
export async function genDiagnostic(
  subject: string,
  topics: string[],
  exam = ""
): Promise<DiagQ[]> {
  const list = topics.map((t, i) => `${i}: ${t}`).join("\n");
  const examLine = exam ? ` Use the real ${exam} exam style and its command words.` : "";
  const prompt = `Write ONE multiple-choice question for EACH of these ${subject} topics, to gauge a Mauritius student's level. Four options each, one correct.${examLine}\n\nTopics:\n${list}\n\nEvery option must be a REAL, fully written-out answer — never just the letter. Output each as a block in EXACTLY this format, one blank line between blocks, no other text:\nQ: <question>\nA) <option>\nB) <option>\nC) <option>\nD) <option>\nCORRECT: <A, B, C or D>\nTOPIC: <the topic number>\n\nExample:\nQ: Which gas do plants absorb during photosynthesis?\nA) Oxygen\nB) Carbon dioxide\nC) Nitrogen\nD) Hydrogen\nCORRECT: B\nTOPIC: 0`;
  // Single call — no retry. The diagnostic is optional and low-stakes (seeds a baseline),
  // and a second AI call risked doubling latency into a multi-minute wait.
  const parsed = parseQuizBlocks(await ask(prompt, 2600), true);
  return parsed.map((q) => ({
    q: q.q,
    options: q.options,
    answer: q.answer,
    topicIndex: q.topicIndex ?? 0,
  }));
}

// Best-effort factual synopsis + key themes/topics for a book the student adds. Original
// wording only — never copyrighted excerpts. If the model doesn't know the book it says so,
// and the tutor then leans on the student's uploads instead of inventing.
export async function genBookInfo(
  title: string,
  author: string | null,
  subject: string | null,
  kind: string
): Promise<{ synopsis: string; themes: string }> {
  const txt = await ask(
    `For the ${kind === "textbook" ? "textbook" : "book"} "${title}"${author ? ` by ${author}` : ""}${
      subject ? ` (studied in ${subject})` : ""
    }, write a SHORT factual synopsis (2-3 sentences, your OWN words, NO copyrighted excerpts or quotes) and list its key ${
      kind === "textbook" ? "topics" : "themes"
    }. If you are not sure this exact book exists, say so plainly in the synopsis rather than inventing. Format EXACTLY:\nSYNOPSIS: <text>\nTHEMES: <comma-separated list>`,
    700
  );
  const synopsis = txt.match(/SYNOPSIS:\s*([\s\S]*?)(?:\nTHEMES:|$)/i)?.[1]?.trim() || "";
  const themes = txt.match(/THEMES:\s*(.+)/i)?.[1]?.trim() || "";
  return { synopsis, themes };
}

// Exam-style questions with marks + a point-by-point mark scheme (SaveMyExams-style, but our
// own original wording — never copied past-paper text). The tutor/marker grades free-text
// answers against the scheme, so questions carry the scheme the model can mark against.
export type MarkPoint = { point: string; marks: number; keywords: string[] };
export type ExamQ = {
  type: string;
  command_word: string;
  question_md: string;
  marks: number;
  difficulty: string;
  mark_scheme: MarkPoint[];
  model_answer_md: string;
};

export async function genExamQuestions(
  subject: string,
  topic: string,
  difficulty = "medium",
  exam = "",
  count = 4
): Promise<ExamQ[]> {
  const examLine = exam ? ` in the real ${exam} exam style` : "";
  const txt = await ask(
    `Write ${count} ORIGINAL exam-style questions${examLine} for a Mauritius ${subject} student on "${topic}". Difficulty: ${difficulty}. Mix command words (Describe, Explain, Calculate, Evaluate, etc.) and mark tariffs (1–6 marks). Write your OWN questions — never copy any real past-paper text.\n\nOutput each question as a block in EXACTLY this format, one blank line between blocks, no other text:\nQ: <the question, ending with the mark tariff e.g. "[4]">\nTYPE: <short|structured|calculation|essay>\nCMD: <the command word, e.g. Explain>\nMARKS: <total marks as a number>\nPOINT: <a creditworthy mark-scheme point> ~ <marks for it> ~ <semicolon-separated keywords>\nPOINT: <another point> ~ <marks> ~ <keywords>\nMODEL: <a concise model answer in your own words>\n\nEvery question needs at least one POINT line; the POINT marks should sum to MARKS.`,
    3000
  );
  const out: ExamQ[] = [];
  for (const b of txt.split(/\n(?=\s*Q:)/i)) {
    const lines = b.split("\n");
    let q = "", type = "short", cmd = "", marks = 0, model = "";
    const mark_scheme: MarkPoint[] = [];
    let mode: "q" | "model" | null = null;
    for (const line of lines) {
      const mQ = line.match(/^\s*Q:\s*(.*)/i);
      const mT = line.match(/^\s*TYPE:\s*(.*)/i);
      const mC = line.match(/^\s*CMD:\s*(.*)/i);
      const mM = line.match(/^\s*MARKS:\s*(\d+)/i);
      const mP = line.match(/^\s*POINT:\s*(.*)/i);
      const mMod = line.match(/^\s*MODEL:\s*(.*)/i);
      if (mQ) { q = mQ[1].trim(); mode = "q"; }
      else if (mT) { type = mT[1].trim().toLowerCase() || "short"; mode = null; }
      else if (mC) { cmd = mC[1].trim(); mode = null; }
      else if (mM) { marks = parseInt(mM[1], 10); mode = null; }
      else if (mP) {
        const parts = mP[1].split("~").map((s) => s.trim());
        const pm = parseInt(parts[1] || "1", 10) || 1;
        const kws = (parts[2] || "").split(";").map((s) => s.trim()).filter(Boolean);
        if (parts[0]) mark_scheme.push({ point: parts[0], marks: pm, keywords: kws });
        mode = null;
      } else if (mMod) { model = mMod[1].trim(); mode = "model"; }
      else if (mode === "q" && line.trim()) q += "\n" + line.trim();
      else if (mode === "model" && line.trim()) model += "\n" + line.trim();
    }
    if (q && mark_scheme.length) {
      if (!marks) marks = mark_scheme.reduce((s, p) => s + p.marks, 0);
      out.push({ type, command_word: cmd, question_md: q, marks, difficulty, mark_scheme, model_answer_md: model });
    }
  }
  return out.slice(0, count);
}

export type Marking = {
  awarded: number;
  per_point: { point: string; earned: boolean; note: string }[];
  feedback: string;
  misconception: string | null;
};

// Grade a free-text answer against the mark scheme — the feature neither reference site has.
export async function markExamAnswer(
  subject: string,
  question: string,
  markScheme: MarkPoint[],
  answer: string,
  maxMarks: number
): Promise<Marking> {
  const scheme = markScheme
    .map((p, i) => `${i + 1}. (${p.marks} mark${p.marks > 1 ? "s" : ""}) ${p.point}${p.keywords.length ? ` [keywords: ${p.keywords.join(", ")}]` : ""}`)
    .join("\n");
  const txt = await ask(
    `You are a fair, encouraging ${subject} examiner marking like a real Cambridge examiner. Total available: ${maxMarks} marks.\n\nMARKING RULES:\n- Award a point if the answer conveys the CORRECT IDEA, even if the wording, synonyms or phrasing differ from the mark scheme. The keywords are a guide, NOT a requirement — do not insist on exact words.\n- Credit points made anywhere in the answer, in any order.\n- Give benefit of the doubt on a borderline point; only withhold a mark if the idea is genuinely absent or wrong.\n- Never double-penalise the same mistake, and never deduct below 0.\n\nQUESTION:\n${question}\n\nMARK SCHEME (each point is worth its stated marks):\n${scheme}\n\nSTUDENT ANSWER:\n${answer || "(blank)"}\n\nOutput EXACTLY this format, no other text:\nAWARDED: <total marks earned, a number — may be a decimal for partial credit>\nP1: <yes or no> - <≤12-word reason>\n(one Pn line per mark-scheme point, in order)\nFEEDBACK: <2-3 sentences: what was good first, then what to add for full marks; warm and exam-focused>\nMISS: <the student's key misconception in ≤8 words, or "none" if the answer was largely sound>`,
    1200
  );
  const awarded = Math.max(
    0,
    Math.min(maxMarks, parseFloat(txt.match(/AWARDED:\s*([\d.]+)/i)?.[1] ?? "0") || 0)
  );
  const per_point = markScheme.map((p, i) => {
    const m = txt.match(new RegExp(`P${i + 1}:\\s*(yes|no)\\s*[-—:]*\\s*(.*)`, "i"));
    return { point: p.point, earned: /yes/i.test(m?.[1] ?? ""), note: (m?.[2] ?? "").trim() };
  });
  const feedback = txt.match(/FEEDBACK:\s*([\s\S]*?)(?:\nMISS:|$)/i)?.[1]?.trim() || "";
  const missRaw = txt.match(/MISS:\s*(.+)/i)?.[1]?.trim() || "";
  const misconception = missRaw && !/^none$/i.test(missRaw) ? missRaw : null;
  return { awarded, per_point, feedback, misconception };
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
