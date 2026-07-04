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
