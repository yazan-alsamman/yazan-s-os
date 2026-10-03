import { describe, expect, it, vi } from "vitest";

import { createOpenAiCompatibleProvider } from "./openai-compatible";
import { ProviderError } from "./provider";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": "req-1" },
    ...init,
  });
}

const config = (fetchImpl: typeof fetch) => ({
  baseUrl: "https://api.example.test/v1/",
  model: "test-model",
  apiKey: "secret-key",
  timeoutMs: 1_000,
  fetchImpl,
});

const request = { messages: [{ role: "user" as const, content: "hi" }], maxOutputTokens: 100 };

describe("openai-compatible provider", () => {
  it("sends a deterministic JSON-mode request and parses the content + usage", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({
        model: "test-model",
        choices: [{ message: { content: '{"statements":[]}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      }),
    );
    const provider = createOpenAiCompatibleProvider(config(fetchImpl as unknown as typeof fetch));
    const result = await provider.generate(request);

    expect(result.text).toBe('{"statements":[]}');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(8);
    expect(result.requestId).toBe("req-1");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/chat/completions");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.temperature).toBe(0);
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer secret-key" });
  });

  it("treats missing or invalid usage counts as null, never zero", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: "{}" } }] }),
    );
    const provider = createOpenAiCompatibleProvider(config(fetchImpl as unknown as typeof fetch));
    const result = await provider.generate(request);
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
  });

  it("maps HTTP 429 to a rate_limited error", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({}, { status: 429 }),
    );
    const provider = createOpenAiCompatibleProvider(config(fetchImpl as unknown as typeof fetch));
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("maps other non-ok responses to a failed error", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({}, { status: 500 }),
    );
    const provider = createOpenAiCompatibleProvider(config(fetchImpl as unknown as typeof fetch));
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: "failed" });
  });

  it("maps a model refusal to a refused error", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ choices: [{ message: { refusal: "I cannot help." } }] }),
    );
    const provider = createOpenAiCompatibleProvider(config(fetchImpl as unknown as typeof fetch));
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: "refused" });
  });

  it("maps empty content to an invalid_response error", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: "   " } }] }),
    );
    const provider = createOpenAiCompatibleProvider(config(fetchImpl as unknown as typeof fetch));
    await expect(provider.generate(request)).rejects.toBeInstanceOf(ProviderError);
  });

  it("omits the authorization header when no key is set", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: "{}" } }] }),
    );
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "https://local.test",
      model: "m",
      timeoutMs: 1_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await provider.generate(request);
    expect((fetchImpl.mock.calls[0]![1] as RequestInit).headers).not.toHaveProperty(
      "authorization",
    );
  });
});
