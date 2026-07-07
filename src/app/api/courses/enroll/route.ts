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

  if (examDate && isNaN(Date.parse(examDate)))
    return Response.json({ error: "invalid_exam_date" }, { status: 400 });

  const { error: enrollError } = await supabase
    .from("enrollments")
    .upsert({ user_id: user.id, course_id: courseId, exam_date: examDate ?? null });
  if (enrollError) return Response.json({ error: enrollError.message }, { status: 500 });

  // seed mastery for every topic in the course (score 20 = not yet assessed)
  const { data: topics } = await supabase
    .from("topics")
    .select("id")
    .eq("course_id", courseId);
  if (topics?.length) {
    const rows = topics.map((t) => ({ user_id: user.id, topic_id: t.id, score: 20 }));
    // ignoreDuplicates: only seed topics with no mastery row yet — re-enrolling must NOT
    // reset a student's earned progress back to the baseline score of 20.
    await supabase
      .from("mastery")
      .upsert(rows, { onConflict: "user_id,topic_id", ignoreDuplicates: true });
  }

  return Response.json({ ok: true, seeded: topics?.length ?? 0 });
}
