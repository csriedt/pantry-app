import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// Placeholder fallbacks
const DEFAULT_BASE_URL = "https://opencode.ai/inference/openai/v1";
const DEFAULT_MODEL_ID = "deepseek-v4.1-flash-free";

/**
 * One source for the model id. The rate-card lookup and the settled event must
 * use the same value, so resolve it here rather than duplicating the env read.
 */
export function getChefModelId(): string {
  return process.env.OPENCODE_MODEL ?? DEFAULT_MODEL_ID;
}

/**
 * OpenCode Console is OpenAI-compatible on its chat-completions endpoint.
 * Credentials are read inside the factory so a build without the key still
 * succeeds; the missing-key error only fires when a turn actually starts.
 */
export function getChefModel(): LanguageModel {
  const apiKey = process.env.OPENCODE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENCODE_API_KEY in the environment.");
  }

  const provider = createOpenAICompatible({
    name: "opencode",
    apiKey,
    baseURL: process.env.OPENCODE_BASE_URL ?? DEFAULT_BASE_URL,
    // Streaming usage is required to settle the reservation after the call.
    includeUsage: true,
  });

  return provider.chatModel(getChefModelId());
}
