import Anthropic from "@anthropic-ai/sdk";

// Direct Anthropic if a key is present, else OpenRouter's Anthropic-compatible endpoint.
const direct = !!process.env.ANTHROPIC_API_KEY;
export const anthropic = direct
  ? new Anthropic()
  : new Anthropic({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api",
    });

// Model split (evaluated empirically on the teacher task):
// - MODEL: the chat TUTOR. nemotron-super-120b teaches best (Socratic, fast ~4s,
//   5/5 reliable) among free models. It does NOT obey forced tool_choice, which is
//   fine — the tutor streams text and mastery is recorded by the tool model below.
// - TOOL_MODEL: forced-tool tasks (mastery classifier, summaries, flashcards,
//   quizzes, diagnostic). openrouter/free reliably obeys forced tool_choice.
// - VISION_MODEL: reading photos (multimodal).
export const MODEL = direct
  ? "claude-sonnet-5"
  : process.env.TUTOR_MODEL || "nvidia/nemotron-3-super-120b-a12b:free";
export const TOOL_MODEL = direct
  ? "claude-sonnet-5"
  : process.env.TOOL_MODEL || "openrouter/free";
export const VISION_MODEL = direct
  ? "claude-sonnet-5"
  : process.env.VISION_MODEL || "google/gemma-4-31b-it:free";

// Free OpenRouter models rate-limit and drop out. CHAT_MODELS is the ordered fallback
// chain: the primary tutor first, then other free models, then openrouter/free (a meta
// route that auto-picks any available free model). Every model gets the SAME system prompt
// and delimited-output rules, so a fallback never changes the tutor's behaviour.
// Tune without code changes via TUTOR_MODELS="a,b,c".
export const CHAT_MODELS: string[] = direct
  ? ["claude-sonnet-5"]
  : (process.env.TUTOR_MODELS || `${MODEL},google/gemma-4-31b-it:free,openrouter/free`)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

// Non-streaming completion with model fallback — returns the first non-empty result.
// Used by every generator (summaries, flashcards, quizzes, diagnostic).
export async function complete(
  messages: Anthropic.MessageParam[],
  maxTokens = 2000,
  models: string[] = CHAT_MODELS
): Promise<{ text: string; model: string | null }> {
  for (const model of models) {
    try {
      const res = await anthropic.messages.create({ model, max_tokens: maxTokens, messages });
      const text = (res.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("");
      if (text.trim()) return { text, model };
    } catch (e) {
      console.error(`model ${model} failed:`, (e as Error)?.message ?? e);
    }
  }
  return { text: "", model: null };
}
