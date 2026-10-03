import "server-only";

import { getServerEnv } from "@/lib/config/env";

import { createOpenAiCompatibleProvider } from "./openai-compatible";
import type { ModelProvider } from "./provider";

/**
 * The configured model provider, or null when AI_PROVIDER = "none" (retrieval-only mode). The key
 * is read here on the server and passed only to the adapter.
 */
export function getModelProvider(): ModelProvider | null {
  const env = getServerEnv();
  if (env.AI_PROVIDER === "none") return null;
  return createOpenAiCompatibleProvider({
    baseUrl: env.AI_BASE_URL!,
    model: env.AI_MODEL!,
    apiKey: env.AI_API_KEY,
    timeoutMs: env.AI_TIMEOUT_MS,
  });
}

/** Non-secret status for the UI (provider name and model only). */
export function getModelStatus(): {
  available: boolean;
  provider: string | null;
  model: string | null;
} {
  const env = getServerEnv();
  return env.AI_PROVIDER === "none"
    ? { available: false, provider: null, model: null }
    : { available: true, provider: env.AI_PROVIDER, model: env.AI_MODEL ?? null };
}
