import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { anthropic, MODEL, TOOL_MODEL } from "@/lib/ai";
import {
  loadMastery,
  buildAgenda,
  systemPrompt,
  MASTERY_TOOL,
  applyMasteryUpdate,
  classifyAttempt,
} from "@/lib/tutor";
import { XP } from "@/lib/levels";

export const maxDuration = 120;

const FREE_DAILY_MESSAGES = 25;
// Free for everyone during testing. Flip FREE_TESTING=false to re-enable the cap.
const FREE_TESTING = process.env.FREE_TESTING !== "false";

const today = () => new Date().toISOString().slice(0, 10);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { sessionId, message, courseId } = (await req.json()) as {
    sessionId?: string;
    message?: string;
    courseId?: string;
  };

  // free-tier daily cap
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, level, language, streak, last_study_date, xp, goal, survey, premium")
    .eq("id", user.id)
    .single();
  if (!profile) return Response.json({ error: "no_profile" }, { status: 400 });

  const { data: usage } = await supabase
    .from("usage")
    .select("messages")
    .eq("user_id", user.id)
    .eq("day", today())
    .maybeSingle();
  const used = usage?.messages ?? 0;
  if (!FREE_TESTING && !profile.premium && used >= FREE_DAILY_MESSAGES)
    return Response.json({ error: "daily_limit", used }, { status: 402 });
  await supabase
    .from("usage")
    .upsert({ user_id: user.id, day: today(), messages: used + 1 });

  // resolve the active course: explicit, else session's, else first enrollment
  let activeCourse = courseId ?? null;
  if (!activeCourse && sessionId) {
    const { data: s } = await supabase
      .from("sessions")
      .select("course_id")
      .eq("id", sessionId)
      .maybeSingle();
    activeCourse = s?.course_id ?? null;
  }
  if (!activeCourse) {
    const { data: e } = await supabase
      .from("enrollments")
      .select("course_id, exam_date")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    activeCourse = e?.course_id ?? null;
  }
  if (!activeCourse)
    return Response.json({ error: "no_course" }, { status: 400 });

  const { data: course } = await supabase
    .from("courses")
    .select("subject, level, board, exam_date")
    .eq("id", activeCourse)
    .maybeSingle();
  // exam date can also live on the enrollment
  const { data: enr } = await supabase
    .from("enrollments")
    .select("exam_date")
    .eq("user_id", user.id)
    .eq("course_id", activeCourse)
    .maybeSingle();
  const courseCtx = course
    ? { ...course, exam_date: enr?.exam_date ?? course.exam_date }
    : null;

  const mastery = await loadMastery(supabase, user.id, activeCourse);
  const { data: materials } = await supabase
    .from("materials")
    .select("filename, extracted_text")
    .eq("user_id", user.id)
    .eq("course_id", activeCourse)
    .eq("status", "ready")
    .limit(6);

  let sid = sessionId;
  let xpEarned = 0;
  if (!sid) {
    const agenda = buildAgenda(mastery);
    const { data: session } = await supabase
      .from("sessions")
      .insert({ user_id: user.id, course_id: activeCourse, agenda })
      .select("id")
      .single();
    if (!session)
      return Response.json({ error: "session_create_failed" }, { status: 500 });
    sid = session.id;
    xpEarned += XP.session;

    // streak
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
  if (message)
    await supabase
      .from("messages")
      .insert({ session_id: sid, user_id: user.id, role: "user", content: message });

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("session_id", sid!)
    .order("id", { ascending: true })
    .limit(60);

  const agenda = buildAgenda(mastery);
  const system = systemPrompt(profile, courseCtx, agenda, mastery, materials ?? []);

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
        let masteryApplied = 0;
        for (let turn = 0; turn < 4; turn++) {
          const msgStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 1024,
            // thinking is Anthropic-only; free OpenRouter models reject it
            ...(MODEL.startsWith("claude") ? { thinking: { type: "disabled" as const } } : {}),
            system,
            tools: [MASTERY_TOOL],
            messages: msgs,
          });
          msgStream.on("text", (delta) => {
            assistantText += delta;
            controller.enqueue(encoder.encode(delta));
          });
          const final = await msgStream.finalMessage();
          if (final.stop_reason !== "tool_use") break;

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type === "tool_use" && block.name === "update_mastery") {
              masteryApplied++;
              xpEarned += await applyMasteryUpdate(
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
        // Fallback: if the model didn't record mastery inline but the student sent an
        // attempt, run a cheap forced-tool classification so adaptation still works.
        if (message && masteryApplied === 0) {
          xpEarned += await classifyAttempt(
            anthropic,
            TOOL_MODEL,
            supabase,
            user.id,
            mastery.slice(0, 8).map((m) => ({
              topic_id: m.topic_id,
              name: m.topics?.name ?? m.topic_id,
            })),
            message,
            assistantText
          );
        }
        if (assistantText)
          await supabase.from("messages").insert({
            session_id: sid,
            user_id: user.id,
            role: "assistant",
            content: assistantText,
          });
        if (xpEarned)
          await supabase
            .from("profiles")
            .update({ xp: (profile.xp ?? 0) + xpEarned })
            .eq("id", user.id);
      } catch (e) {
        // Signal the frontend to render the clean "teacher unavailable" card + notify
        // button, instead of showing a raw error to students.
        controller.enqueue(encoder.encode("[[TEACHER_DOWN]]"));
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
      "X-Xp-Earned": String(xpEarned),
    },
  });
}
