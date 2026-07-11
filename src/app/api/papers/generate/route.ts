import { createClient } from "@/lib/supabase/server";
import { genExamQuestions, type ExamQ } from "@/lib/study";

export const maxDuration = 90;

// Write an ORIGINAL multi-topic practice paper: pick a spread of topics for breadth and
// generate a couple of exam-style questions each (in parallel), then persist as the
// student's own question bank so the paper appears in the practice deck (AI-marked).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId } = (await req.json()) as { courseId: string };
  if (!courseId) return Response.json({ error: "no_course" }, { status: 400 });

  const { data: course } = await supabase
    .from("courses")
    .select("subject, board, level, syllabus_code")
    .eq("id", courseId)
    .maybeSingle();
  const subject = course?.subject ?? "your subject";
  const exam = course?.board
    ? `${course.board} ${(course.level ?? "").toUpperCase().replace(/_/g, " ")}`.trim() +
      (course.syllabus_code ? ` (syllabus ${course.syllabus_code})` : "")
    : "";

  const { data: prof } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .maybeSingle();
  const lang = prof?.language ?? "en";

  // Pick up to 3 topics for breadth: 2 weakest by mastery + 1 other; else first 3 distinct.
  const { data: topics } = await supabase
    .from("topics")
    .select("id, name")
    .eq("course_id", courseId);
  const all = topics ?? [];
  const byId = new Map(all.map((t) => [t.id, t] as const));
  const ids = all.map((t) => t.id);
  const { data: mrows } = await supabase
    .from("mastery")
    .select("topic_id, score")
    .eq("user_id", user.id)
    .in("topic_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .order("score", { ascending: true });
  const weak = (mrows ?? []).map((m) => m.topic_id).filter((id) => byId.has(id)).slice(0, 2);
  const rest = ids.filter((id) => !weak.includes(id));
  const chosen = [...weak, ...rest].slice(0, 3).map((id) => byId.get(id)!);

  // Generate per-topic in parallel; keep the topic id alongside each batch. One topic
  // failing shouldn't sink the whole paper, so catch per call.
  const results = await Promise.all(
    chosen.map((t) =>
      genExamQuestions(subject, t.name, "medium", exam, 2, lang)
        .then((qs) => qs.map((q) => ({ q, tid: t.id })))
        .catch(() => [] as { q: ExamQ; tid: string }[])
    )
  );
  const flat = results.flat();
  if (!flat.length) return Response.json({ error: "generation_failed" }, { status: 502 });

  const rows = flat.map(({ q, tid }) => ({
    owner_id: user.id,
    is_template: false,
    course_id: courseId,
    topic_id: tid,
    type: q.type,
    command_word: q.command_word || null,
    question_md: q.question_md,
    marks: q.marks,
    difficulty: q.difficulty,
    mark_scheme: q.mark_scheme,
    model_answer_md: q.model_answer_md || null,
    source: "generated",
  }));
  const { data: inserted, error: insertErr } = await supabase
    .from("questions")
    .insert(rows)
    .select("id");
  if (insertErr || !inserted?.length) {
    console.error("papers insert failed:", insertErr?.message);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }

  const totalMarks = flat.reduce((s, { q }) => s + (q.marks || 0), 0);
  return Response.json({ ok: true, created: inserted.length, totalMarks });
}
