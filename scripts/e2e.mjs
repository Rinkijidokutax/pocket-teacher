// e2e check: sign in as test student, run a tutor exchange through /api/chat,
// verify streaming, session persistence, and mastery updates.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const BASE = process.env.BASE ?? "http://localhost:3000";
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const { data, error } = await supabase.auth.signInWithPassword({
  email: "test.student@pocketteacher.mu",
  password: "TestStudent123!",
});
if (error) throw error;
const session = data.session;

// build the @supabase/ssr cookie (base64url JSON, chunked at 3180 chars)
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const CHUNK = 3180;
const cookies = [];
if (value.length <= CHUNK) {
  cookies.push(`sb-${ref}-auth-token=${value}`);
} else {
  for (let i = 0; i * CHUNK < value.length; i++)
    cookies.push(`sb-${ref}-auth-token.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}
const cookieHeader = cookies.join("; ");

async function chat(sessionId, message) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ sessionId, message }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}: ${await res.text()}`);
  const sid = res.headers.get("X-Session-Id");
  const text = await res.text();
  return { sid, text, used: res.headers.get("X-Messages-Used") };
}

console.log("1) kickoff…");
const kick = await chat(null, null);
console.log(`   session=${kick.sid} used=${kick.used}`);
console.log("   tutor:", kick.text.slice(0, 300).replace(/\n/g, " "));
if (!kick.sid || kick.text.length < 20) throw new Error("kickoff failed");

console.log("2) student answers a question wrong on purpose…");
const r2 = await chat(
  kick.sid,
  "Hmm I think 3x - 7 = 11 means x = 18/3 = 6... wait no, x = (11-7)/3 = 1.33?"
);
console.log("   tutor:", r2.text.slice(0, 300).replace(/\n/g, " "));

console.log("3) student answers correctly…");
const r3 = await chat(kick.sid, "Oh I see! 3x = 18 so x = 6. Final answer: x = 6");
console.log("   tutor:", r3.text.slice(0, 300).replace(/\n/g, " "));

// verify persistence
const uid = session.user.id;
const { data: msgs } = await supabase
  .from("messages")
  .select("role")
  .eq("session_id", kick.sid);
const { data: mastery } = await supabase
  .from("mastery")
  .select("topic_id, score, attempts, review_due")
  .eq("user_id", uid)
  .gt("attempts", 0);
const { data: usage } = await supabase.from("usage").select("*").eq("user_id", uid);

console.log(`4) persisted messages: ${msgs?.length}`);
console.log(`5) mastery rows with attempts>0:`, mastery);
console.log(`6) usage:`, usage);

if (!msgs || msgs.length < 4) throw new Error("messages not persisted");
if (!mastery || mastery.length === 0)
  throw new Error("no mastery update recorded — tool loop failed");
console.log("\n✅ E2E PASS");
