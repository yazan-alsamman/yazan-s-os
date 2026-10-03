/**
 * Model provider abstraction (Phase 8, ADR 0047). The Copilot depends only on this interface, so
 * the vendor can change without touching the Copilot domain. Providers are server-only: the API
 * key never leaves the server and is never persisted.
 */
export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderRequest {
  messages: ProviderMessage[];
  /** Upper bound on generated tokens. */
  maxOutputTokens: number;
}

export interface ProviderResponse {
  /** Raw text content (expected to be the JSON answer contract — validated by the caller). */
  text: string;
  provider: string;
  model: string;
  /** Usage exactly as reported by the provider; null when not reported (never estimated). */
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  requestId: string | null;
}

export type ProviderErrorKind =
  "unavailable" | "timeout" | "rate_limited" | "invalid_response" | "refused" | "failed";

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const PROVIDER_ERROR_TEXT: Record<ProviderErrorKind, string> = {
  unavailable: "No AI model is configured, so answers are not synthesized.",
  timeout: "The AI model did not respond in time.",
  rate_limited: "The AI provider is rate-limiting requests.",
  invalid_response: "The AI model returned a response that could not be validated.",
  refused: "The AI model declined to answer.",
  failed: "The AI model request failed.",
};

export interface ModelProvider {
  readonly name: string;
  readonly model: string;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}
