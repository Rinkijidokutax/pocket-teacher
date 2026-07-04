import { createClient } from "@/lib/supabase/server";
import { genFlashcards } from "@/lib/study";

export const maxDuration = 90;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId, topicId, materialId, count } = (await req.json()) as {
    courseId: string;
    topicId?: string;
    materialId?: string;
    count?: number;
  };
  if (!courseId) return Response.json({ error: "no_course" }, { status: 400 });

  const { data: course } = await supabase
    .from("courses")
    .select("subject")
    .eq("id", courseId)
    .maybeSingle();
  const subject = course?.subject ?? "your subject";

  // pick the topic: explicit, else the student's weakest in this course
  let topicName = "key concepts";
  let tid = topicId ?? null;
  if (tid) {
    const { data: t } = await supabase.from("topics").select("name").eq("id", tid).maybeSingle();
    topicName = t?.name ?? topicName;
  } else {
    const { data: topics } = await supabase.from("topics").select("id").eq("course_id", courseId);
    const ids = (topics ?? []).map((r) => r.id);
    const { data: weak } = await supabase
      .from("mastery")
      .select("topic_id, score, topics(name)")
      .eq("user_id", user.id)
      .in("topic_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .order("score", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (weak) {
      tid = weak.topic_id;
      topicName = (weak.topics as { name?: string } | null)?.name ?? topicName;
    }
  }

  let source: string | null = null;
  if (materialId) {
    const { data: m } = await supabase
      .from("materials")
      .select("extracted_text")
      .eq("id", materialId)
      .eq("user_id", user.id)
      .maybeSingle();
    source = m?.extracted_text ?? null;
  }

  const cards = await genFlashcards(subject, topicName, source, count ?? 10);
  if (!cards.length) return Response.json({ error: "generation_failed" }, { status: 502 });

  await supabase.from("flashcards").insert(
    cards.map((c) => ({
      user_id: user.id,
      course_id: courseId,
      topic_id: tid,
      front: c.front,
      back: c.back,
    }))
  );

  return Response.json({ ok: true, created: cards.length, topic: topicName });
}
