import { createClient } from "@/lib/supabase/server";
import { genExaminerReport, type ExaminerStats } from "@/lib/study";
import { loadMastery } from "@/lib/tutor";

export const maxDuration = 60;

// "Examiner's report on you" — aggregates the student's OWN marked exam attempts for one course
// into a compact stats summary, then asks the model for an original, personalised report about
// them. RLS already scopes every read to the logged-in student.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId } = (await req.json()) as { courseId?: string };
  if (!courseId) return Response.json({ error: "no_course" }, { status: 400 });

  const { data: course } = await supabase
    .from("courses")
    .select("subject")
    .eq("id", courseId)
    .maybeSingle();
  const subject = course?.subject ?? "your subject";

  const { data: prof } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .maybeSingle();
  const lang = prof?.language ?? "en";

  // The student's own questions in this course → their marked attempts on them.
  const { data: qs } = await supabase
    .from("questions")
    .select("id, command_word")
    .eq("owner_id", user.id)
    .eq("course_id", courseId);
  const questions = qs ?? [];
  const ids = questions.map((q) => q.id);
  const { data: att } = ids.length
    ? await supabase
        .from("question_attempts")
        .select("question_id, awarded_marks, max_marks, misconception")
        .eq("user_id", user.id)
        .in("question_id", ids)
    : { data: [] };
  const attempts = att ?? [];
  if (attempts.length === 0) return Response.json({ error: "no_data" }, { status: 400 });

  const pct = (a: number, m: number) => (m > 0 ? (a / m) * 100 : 0);
  const avgPercent = Math.round(
    attempts.reduce((s, a) => s + pct(a.awarded_marks, a.max_marks), 0) / attempts.length
  );

  // Average score by command word (State/Explain/Calculate…) — where exam technique shows.
  const cwById = new Map(questions.map((q) => [q.id, q.command_word as string | null]));
  const cwAgg = new Map<string, { sum: number; n: number }>();
  for (const a of attempts) {
    const w = cwById.get(a.question_id);
    if (!w) continue;
    const cur = cwAgg.get(w) ?? { sum: 0, n: 0 };
    cur.sum += pct(a.awarded_marks, a.max_marks);
    cur.n += 1;
    cwAgg.set(w, cur);
  }
  const commandWordStats = [...cwAgg.entries()]
    .map(([word, v]) => ({ word, avgPercent: Math.round(v.sum / v.n) }))
    .sort((a, b) => a.avgPercent - b.avgPercent);

  // Weakest topics + recurring misconceptions come from mastery (already score-ascending).
  const mastery = await loadMastery(supabase, user.id, courseId);
  const weakestTopics = mastery
    .filter((m) => m.attempts > 0)
    .slice(0, 3)
    .map((m) => ({ name: m.topics?.name ?? "a topic", score: m.score }));

  const missTally = new Map<string, number>();
  const addMiss = (s?: string | null) => {
    const k = (s ?? "").trim();
    if (k) missTally.set(k, (missTally.get(k) ?? 0) + 1);
  };
  attempts.forEach((a) => addMiss(a.misconception));
  mastery.forEach((m) => (m.misconceptions ?? []).forEach(addMiss));
  const recurringMisconceptions = [...missTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s);

  const stats: ExaminerStats = {
    attempts: attempts.length,
    avgPercent,
    weakestTopics,
    recurringMisconceptions,
    commandWordStats,
  };
  const report = await genExaminerReport(subject, stats, lang);
  return Response.json({ ok: true, report, attempts: attempts.length });
}
