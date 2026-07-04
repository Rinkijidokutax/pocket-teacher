import Anthropic from "@anthropic-ai/sdk";

// Direct Anthropic if a key is present, else OpenRouter's Anthropic-compatible endpoint.
const direct = !!process.env.ANTHROPIC_API_KEY;
export const anthropic = direct
  ? new Anthropic()
  : new Anthropic({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api",
    });
export const MODEL = direct ? "claude-sonnet-5" : "anthropic/claude-sonnet-5";
