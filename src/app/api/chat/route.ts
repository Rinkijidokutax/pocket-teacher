import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  buildAgenda,
  systemPrompt,
  MASTERY_TOOL,
  applyMasteryUpdate,
  type MasteryRow,
} from "@/lib/tutor";

export const maxDuration = 120;

const FREE_DAILY_MESSAGES = 25;
// prefer direct Anthropic; fall back to OpenRouter's Anthropic-compatible endpoint
const direct = !!process.env.ANTHROPIC_API_KEY;
const anthropic = direct
  ? new Anthropic()
  : new Anthropic({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api",
    });
const MODEL = direct ? "claude-sonnet-5" : "anthropic/claude-sonnet-5";

const today = () => new Date().toISOString().slice(0, 10);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { sessionId, message } = (await req.json()) as {
    sessionId?: string;
    message?: string;
  };

  // free-tier daily cap
  const { data: usage } = await supabase
    .from("usage")
    .select("messages")
    .eq("user_id", user.id)
    .eq("day", today())
    .maybeSingle();
  const used = usage?.messages ?? 0;
  if (used >= FREE_DAILY_MESSAGES)
    return Response.json({ error: "daily_limit", used }, { status: 402 });
  await supabase
    .from("usage")
    .upsert({ user_id: user.id, day: today(), messages: used + 1 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, level, language, exam_date, goal, streak, last_study_date")
    .eq("id", user.id)
    .single();
  if (!profile) return Response.json({ error: "no_profile" }, { status: 400 });

  const { data: masteryData } = await supabase
    .from("mastery")
    .select(
      "topic_id, score, attempts, interval_days, review_due, misconceptions, syllabus_topics(name, unit)"
    )
    .eq("user_id", user.id)
    .order("score", { ascending: true });
  const mastery = (masteryData ?? []) as unknown as MasteryRow[];

  let sid = sessionId;
  if (!sid) {
    const agenda = await buildAgenda(supabase, user.id);
    const { data: session, error } = await supabase
      .from("sessions")
      .insert({ user_id: user.id, agenda })
      .select("id")
      .single();
    if (error || !session)
      return Response.json({ error: "session_create_failed" }, { status: 500 });
    sid = session.id;

    // streak: consecutive study days
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streak =
      profile.last_study_date === today()
        ? profile.streak
        : profile.last_study_date === yesterday
          ? profile.streak + 1
          : 1;
    await supabase
      .from("profiles")
      .update({ streak, last_study_date: today() })
      .eq("id", user.id);
    profile.streak = streak;
  }

  const userText =
    message ??
    "(The student just opened today's session. Greet them and begin the agenda.)";
  if (message) {
    await supabase
      .from("messages")
      .insert({ session_id: sid, user_id: user.id, role: "user", content: message });
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("session_id", sid!)
    .order("id", { ascending: true })
    .limit(60);

  const agenda = await buildAgenda(supabase, user.id);
  const system = systemPrompt(profile, agenda, mastery);

  const apiMessages: Anthropic.MessageParam[] = [
    ...(history ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userText },
  ];

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let msgs = apiMessages;
        // tool-use loop: stream text, apply mastery updates, continue
        for (let turn = 0; turn < 4; turn++) {
          const msgStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 1024,
            thinking: { type: "disabled" }, // fast phone chat; adaptive default adds latency
            system,
            tools: [MASTERY_TOOL],
            messages: msgs,
          });
          msgStream.on("text", (delta) => {
            assistantText += delta;
            controller.enqueue(encoder.encode(delta));
          });
          const final = await msgStream.finalMessage();
          console.log(
            "turn",
            turn,
            "stop:",
            final.stop_reason,
            "tools:",
            final.content.filter((b) => b.type === "tool_use").map((b) => b.name)
          );
          if (final.stop_reason !== "tool_use") break;

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type === "tool_use" && block.name === "update_mastery") {
              await applyMasteryUpdate(
                supabase,
                user.id,
                block.input as { topic_id: string; gotIt: boolean; misconception?: string }
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: "recorded",
              });
            }
          }
          msgs = [
            ...msgs,
            { role: "assistant", content: final.content },
            { role: "user", content: toolResults },
          ];
        }
        if (assistantText) {
          await supabase.from("messages").insert({
            session_id: sid,
            user_id: user.id,
            role: "assistant",
            content: assistantText,
          });
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode("\n\n(Connection hiccup — send your message again.)")
        );
        console.error("chat error", e);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Session-Id": sid!,
      "X-Messages-Used": String(used + 1),
      "X-Messages-Cap": String(FREE_DAILY_MESSAGES),
    },
  });
}
