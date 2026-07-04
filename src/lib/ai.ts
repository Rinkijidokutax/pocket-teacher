import Anthropic from "@anthropic-ai/sdk";

// Direct Anthropic if a key is present, else OpenRouter's Anthropic-compatible endpoint.
const direct = !!process.env.ANTHROPIC_API_KEY;
export const anthropic = direct
  ? new Anthropic()
  : new Anthropic({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api",
    });

// Model: direct Anthropic -> Sonnet 5. OpenRouter -> free auto-router by default
// (openrouter/free picks an available free, tool-capable model, so it works at $0).
// Override with TUTOR_MODEL (e.g. "anthropic/claude-sonnet-5") once credits are added.
export const MODEL = direct
  ? "claude-sonnet-5"
  : process.env.TUTOR_MODEL || "openrouter/free";

// Vision (reading photos) needs a multimodal model.
export const VISION_MODEL = direct
  ? "claude-sonnet-5"
  : process.env.VISION_MODEL || "google/gemma-4-31b-it:free";
