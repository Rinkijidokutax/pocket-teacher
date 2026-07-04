// v2 e2e: enroll (API) -> course-aware tutor session -> verify XP + mastery + persistence.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const BASE = process.env.BASE ?? "http://localhost:3000";
const MATHS_COURSE = "61941fef-dfd2-4053-a8f3-f0e2a4e4e0f8"; // O-Level Maths template

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data, error } = await supabase.auth.signInWithPassword({
  email: "test.student@pocketteacher.mu",
  password: "TestStudent123!",
});
if (error) throw error;
const session = data.session;
const uid = session.user.id;

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const CHUNK = 3180;
const cookies = [];
if (value.length <= CHUNK) cookies.push(`sb-${ref}-auth-token=${value}`);
else for (let i = 0; i * CHUNK < value.length; i++)
  cookies.push(`sb-${ref}-auth-token.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`);
const Cookie = cookies.join("; ");

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie },
    body: JSON.stringify(body),
  });
  return res;
}
async function chat(sessionId, message, courseId) {
  const res = await api("/api/chat", { sessionId, message, courseId });
  if (!res.ok) throw new Error(`chat ${res.status}: ${await res.text()}`);
  return {
    sid: res.headers.get("X-Session-Id"),
    xp: res.headers.get("X-Xp-Earned"),
    text: await res.text(),
  };
}

console.log("1) enroll in O-Level Maths…");
const enr = await api("/api/courses/enroll", { courseId: MATHS_COURSE, examDate: "2026-11-03" });
console.log("  ", await enr.json());

console.log("2) kickoff course-aware session…");
const k = await chat(null, null, MATHS_COURSE);
console.log(`   xp+${k.xp} · tutor: ${k.text.slice(0, 180).replace(/\n/g, " ")}`);

console.log("3) wrong then right on a linear equation…");
await chat(k.sid, "3x - 7 = 11, so x = 1.33?", MATHS_COURSE);
const r = await chat(k.sid, "Oh, 3x = 18 so x = 6.", MATHS_COURSE);
console.log(`   xp+${r.xp} · tutor: ${r.text.slice(0, 180).replace(/\n/g, " ")}`);

const { data: prof } = await supabase.from("profiles").select("xp, streak").eq("id", uid).single();
const { data: mastery } = await supabase
  .from("mastery")
  .select("score, attempts, review_due, topics(name)")
  .eq("user_id", uid)
  .gt("attempts", 0);
const { count } = await supabase
  .from("mastery")
  .select("*", { count: "exact", head: true })
  .eq("user_id", uid);
const { data: msgs } = await supabase.from("messages").select("role").eq("session_id", k.sid);

console.log(`4) profile: xp=${prof?.xp} streak=${prof?.streak}`);
console.log(`5) mastery rows seeded: ${count} · with attempts:`, mastery);
console.log(`6) messages persisted: ${msgs?.length}`);

if (count !== 30) throw new Error(`expected 30 seeded topics, got ${count}`);
if (!mastery?.length) throw new Error("no mastery update recorded");
if (!prof?.xp || prof.xp < 5) throw new Error("no XP awarded");
if (!msgs || msgs.length < 4) throw new Error("messages not persisted");
console.log("\n✅ V2 E2E PASS");
