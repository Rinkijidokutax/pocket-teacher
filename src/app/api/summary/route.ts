import { createClient } from "@/lib/supabase/server";
import { genSummary } from "@/lib/study";

export const maxDuration = 90;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { courseId, topicId, materialId } = (await req.json()) as {
    courseId?: string;
    topicId?: string;
    materialId?: string;
  };

  const { data: course } = courseId
    ? await supabase.from("courses").select("subject").eq("id", courseId).maybeSingle()
    : { data: null };
  const subject = course?.subject ?? "your subject";

  let topic = "revision";
  let source: string | null = null;
  if (topicId) {
    const { data: t } = await supabase.from("topics").select("name").eq("id", topicId).maybeSingle();
    topic = t?.name ?? topic;
  }
  if (materialId) {
    const { data: m } = await supabase
      .from("materials")
      .select("extracted_text, filename")
      .eq("id", materialId)
      .eq("user_id", user.id)
      .maybeSingle();
    source = m?.extracted_text ?? null;
    if (!topicId) topic = m?.filename ?? topic;
  }

  const out = await genSummary(subject, topic, source);
  if (!out) return Response.json({ error: "generation_failed" }, { status: 502 });

  const { data: row } = await supabase
    .from("summaries")
    .insert({
      user_id: user.id,
      course_id: courseId ?? null,
      topic_id: topicId ?? null,
      material_id: materialId ?? null,
      title: out.title,
      content: out.content,
    })
    .select("id, title, content")
    .single();

  return Response.json({ ok: true, summary: row });
}
