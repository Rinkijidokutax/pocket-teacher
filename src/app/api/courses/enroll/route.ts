import { createClient } from "@/lib/supabase/server";

// Enroll the student in a template course and seed a fresh mastery map for it.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId, examDate } = (await req.json()) as {
    courseId: string;
    examDate?: string;
  };

  await supabase
    .from("enrollments")
    .upsert({ user_id: user.id, course_id: courseId, exam_date: examDate ?? null });

  // seed mastery for every topic in the course (score 20 = not yet assessed)
  const { data: topics } = await supabase
    .from("topics")
    .select("id")
    .eq("course_id", courseId);
  if (topics?.length) {
    const rows = topics.map((t) => ({ user_id: user.id, topic_id: t.id, score: 20 }));
    await supabase.from("mastery").upsert(rows, { onConflict: "user_id,topic_id" });
  }

  return Response.json({ ok: true, seeded: topics?.length ?? 0 });
}
