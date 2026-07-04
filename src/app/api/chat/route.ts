import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { anthropic, CHAT_MODELS } from "@/lib/ai";
import {
  loadMastery,
  buildAgenda,
  systemPrompt,
  MASTERY_TOOL,
  applyMasteryUpdate,
  parseMasteryMarkers,
  stripMasteryMarkers,
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

  // Load the most RECENT 60 messages (not the oldest), then restore chronological order.
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("session_id", sid!)
    .order("id", { ascending: false })
    .limit(60);
  const chron = (history ?? []).slice().reverse();

  const agenda = buildAgenda(mastery);
  const firstTurn = chron.length === 0;
  const system = systemPrompt(profile, courseCtx, agenda, mastery, materials ?? [], firstTurn);

  const mapped: Anthropic.MessageParam[] = chron.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  // A real message was just persisted above, so it's already in `mapped` — don't append it
  // again (that sent the student's turn to the model twice). Only the kickoff needs the opener.
  const apiMessages: Anthropic.MessageParam[] =
    message && mapped.length
      ? mapped
      : [...mapped, { role: "user" as const, content: userText }];

  const encoder = new TextEncoder();
  let assistantText = "";
  // Stream to the student but never emit a mastery marker. Hold back everything from the
  // first "[[" onward until we can strip complete markers at the end.
  let flushedLen = 0;
  let dropPrefix = 0;
  // Free models re-greet on continuing turns despite instructions. Gate the first line so
  // a stray "Hi <name>!" is dropped deterministically (only on non-first turns).
  let greetChecked = firstTurn;
  const flush = (controller: ReadableStreamDefaultController, final: boolean) => {
    if (!greetChecked) {
      const nl = assistantText.indexOf("\n");
      if (nl === -1 && !final) return; // wait for the first line before deciding
      const firstLine = (nl === -1 ? assistantText : assistantText.slice(0, nl)).trim();
      if (
        firstLine.length < 90 &&
        /^(hi|hello|hey|bonjour|salut|good (morning|afternoon|evening|day))\b/i.test(firstLine)
      ) {
        dropPrefix = nl === -1 ? assistantText.length : nl + 1;
        flushedLen = dropPrefix;
      }
      greetChecked = true;
    }
    if (final) {
      const tail = stripMasteryMarkers(assistantText.slice(flushedLen));
      if (tail) controller.enqueue(encoder.encode(tail));
      flushedLen = assistantText.length;
      return;
    }
    const open = assistantText.indexOf("[[", flushedLen);
    const cut = open >= 0 ? open : assistantText.length;
    if (cut > flushedLen) {
      controller.enqueue(encoder.encode(assistantText.slice(flushedLen, cut)));
      flushedLen = cut;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      let masteryApplied = 0;
      // Try each model in the fallback chain. Fall back only if a model dies BEFORE it
      // streams any text — once the student is seeing an answer we commit to that model.
      for (const model of CHAT_MODELS) {
        if (assistantText) break;
        try {
          let msgs = apiMessages;
          for (let turn = 0; turn < 4; turn++) {
            const msgStream = anthropic.messages.stream({
              model,
              max_tokens: 1024,
              // thinking + tools are Anthropic-only; free OpenRouter models reject them.
              // Free models record mastery via the [[MASTERY]] marker parsed below instead.
              ...(model.startsWith("claude") ? { thinking: { type: "disabled" as const } } : {}),
              system,
              ...(model.startsWith("claude") ? { tools: [MASTERY_TOOL] } : {}),
              messages: msgs,
            });
            msgStream.on("text", (delta) => {
              assistantText += delta;
              flush(controller, false);
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
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "recorded" });
              }
            }
            msgs = [
              ...msgs,
              { role: "assistant", content: final.content },
              { role: "user", content: toolResults },
            ];
          }
          break; // this model answered
        } catch (e) {
          console.error(`chat model ${model} failed:`, (e as Error)?.message ?? e);
          // loop tries the next model — unless text was already streamed (guard above)
        }
      }

      if (assistantText) {
        try {
          flush(controller, true); // flush the held-back tail (markers stripped)
          // Free models record mastery via the [[MASTERY ...]] marker; parse + apply it.
          if (message && masteryApplied === 0) {
            for (const mk of parseMasteryMarkers(assistantText)) {
              masteryApplied++;
              xpEarned += await applyMasteryUpdate(supabase, user.id, mk);
            }
          }
          const cleanText = stripMasteryMarkers(assistantText.slice(dropPrefix)).trim();
          if (cleanText)
            await supabase.from("messages").insert({
              session_id: sid,
              user_id: user.id,
              role: "assistant",
              content: cleanText,
            });
          if (xpEarned)
            await supabase
              .from("profiles")
              .update({ xp: (profile.xp ?? 0) + xpEarned })
              .eq("id", user.id);
        } catch (e) {
          console.error("chat post-processing error", e);
        }
      } else {
        // Every model failed — render the clean "teacher unavailable" card + notify button.
        controller.enqueue(encoder.encode("[[TEACHER_DOWN]]"));
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
