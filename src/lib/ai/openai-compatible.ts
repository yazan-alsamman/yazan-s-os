import {
  ProviderError,
  type ModelProvider,
  type ProviderRequest,
  type ProviderResponse,
} from "./provider";

/**
 * One generic adapter for any Chat Completions-compatible endpoint (hosted or local; ADR 0047).
 * No SDK, no tool calling: the model only receives already-retrieved context and must answer in
 * JSON. `fetchImpl` is injectable so the request/response contract is unit-tested without network.
 */
export function createOpenAiCompatibleProvider(config: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): ModelProvider {
  const doFetch = config.fetchImpl ?? fetch;
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    name: "openai_compatible",
    model: config.model,
    async generate(request: ProviderRequest): Promise<ProviderResponse> {
      const started = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: config.model,
            messages: request.messages,
            temperature: 0,
            max_tokens: request.maxOutputTokens,
            response_format: { type: "json_object" },
          }),
        });
      } catch (error) {
        if (controller.signal.aborted) throw new ProviderError("timeout", "Provider timed out");
        throw new ProviderError("failed", `Provider request failed: ${(error as Error).name}`);
      } finally {
        clearTimeout(timer);
      }
      if (response.status === 429) throw new ProviderError("rate_limited", "Provider returned 429");
      if (!response.ok) throw new ProviderError("failed", `Provider returned ${response.status}`);

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ProviderError("invalid_response", "Provider response is not JSON");
      }
      const parsed = body as {
        model?: unknown;
        choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }[];
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      };
      const choice = parsed.choices?.[0];
      if (typeof choice?.message?.refusal === "string" && choice.message.refusal) {
        throw new ProviderError("refused", "Provider refused");
      }
      const text = choice?.message?.content;
      if (typeof text !== "string" || text.trim() === "") {
        throw new ProviderError("invalid_response", "Provider response has no content");
      }
      const count = (v: unknown) =>
        typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
      return {
        text,
        provider: "openai_compatible",
        model: typeof parsed.model === "string" ? parsed.model : config.model,
        inputTokens: count(parsed.usage?.prompt_tokens),
        outputTokens: count(parsed.usage?.completion_tokens),
        latencyMs: Math.round(performance.now() - started),
        requestId: response.headers.get("x-request-id"),
      };
    },
  };
}
