import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { anthropic, MODEL } from "@/lib/ai";

export const maxDuration = 120;

// Extract text from an uploaded file. Images -> vision OCR; PDFs -> unpdf; text as-is.
async function extractText(
  kind: string,
  filename: string,
  bytes: ArrayBuffer
): Promise<string> {
  if (kind === "image") {
    const b64 = Buffer.from(bytes).toString("base64");
    const media = filename.toLowerCase().endsWith(".png")
      ? "image/png"
      : filename.toLowerCase().match(/\.(jpg|jpeg)$/)
        ? "image/jpeg"
        : "image/webp";
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: media as "image/png", data: b64 },
            },
            {
              type: "text",
              text: "Transcribe ALL text in this image exactly (it's a student's study material or a problem). Describe any diagrams, graphs or figures in words. Output only the transcription.",
            },
          ],
        },
      ],
    });
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }
  if (kind === "pdf") {
    const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await unpdfExtract(doc, { mergePages: true });
    return typeof text === "string" ? text : (text as string[]).join("\n");
  }
  return Buffer.from(bytes).toString("utf8");
}

const SYLLABUS_TOOL = {
  name: "save_syllabus",
  description: "Save the structured topic tree extracted from a syllabus.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: { type: "string", description: "the subject name, e.g. Mathematics" },
      level: {
        type: "string",
        description:
          "one of: primary, nce, o_level, hsc, university, self — best guess from the content",
      },
      board: { type: "string", description: "exam board if stated, else 'Custom'" },
      emoji: { type: "string", description: "one emoji representing the subject" },
      topics: {
        type: "array",
        description: "flat list of topics in syllabus order",
        items: {
          type: "object",
          properties: {
            unit: { type: "string" },
            name: { type: "string" },
          },
          required: ["unit", "name"],
        },
      },
    },
    required: ["subject", "level", "topics"],
  },
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { materialId } = (await req.json()) as { materialId: string };
  const { data: mat } = await supabase
    .from("materials")
    .select("id, kind, filename, storage_path, course_id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mat) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    const { data: file, error: dlErr } = await supabase.storage
      .from("materials")
      .download(mat.storage_path);
    if (dlErr || !file) throw dlErr ?? new Error("download failed");
    const bytes = await file.arrayBuffer();
    const text = (await extractText(mat.kind, mat.filename, bytes)).slice(0, 40000);

    if (mat.kind === "syllabus") {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 3200, // ponytail: ~100 topics; huge syllabi may truncate — raise if needed
        tools: [SYLLABUS_TOOL],
        tool_choice: { type: "tool", name: "save_syllabus" },
        messages: [
          {
            role: "user",
            content: `Here is a course syllabus. Extract its topic tree — every teachable topic, grouped into units, in order. If a topic list is sparse, expand it into the standard topics a student at that level would need.\n\n${text}`,
          },
        ],
      });
      const call = res.content.find((b) => b.type === "tool_use") as
        | Anthropic.ToolUseBlock
        | undefined;
      const parsed = call?.input as
        | { subject: string; level: string; board?: string; emoji?: string; topics: { unit: string; name: string }[] }
        | undefined;
      if (!parsed?.topics?.length) throw new Error("no topics extracted");

      const { data: course } = await supabase
        .from("courses")
        .insert({
          owner_id: user.id,
          subject: parsed.subject,
          level: parsed.level || "self",
          board: parsed.board || "Custom",
          emoji: parsed.emoji || "📘",
          source: "upload",
          is_template: false,
        })
        .select("id")
        .single();
      if (!course) throw new Error("course create failed");

      const topicRows = parsed.topics.slice(0, 120).map((t, i) => ({
        course_id: course.id,
        unit: t.unit || "Topics",
        name: t.name,
        sort: i,
      }));
      const { data: inserted } = await supabase
        .from("topics")
        .insert(topicRows)
        .select("id");
      await supabase
        .from("enrollments")
        .upsert({ user_id: user.id, course_id: course.id });
      if (inserted?.length)
        await supabase.from("mastery").upsert(
          inserted.map((t) => ({ user_id: user.id, topic_id: t.id, score: 20 })),
          { onConflict: "user_id,topic_id" }
        );
      await supabase
        .from("materials")
        .update({ status: "ready", extracted_text: text.slice(0, 8000), course_id: course.id })
        .eq("id", mat.id);
      return Response.json({ ok: true, courseId: course.id, topics: inserted?.length ?? 0 });
    }

    await supabase
      .from("materials")
      .update({ status: "ready", extracted_text: text })
      .eq("id", mat.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("process error", e);
    await supabase.from("materials").update({ status: "error" }).eq("id", mat.id);
    return Response.json({ error: "process_failed" }, { status: 500 });
  }
}
