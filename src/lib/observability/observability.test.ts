import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "./logger";
import { resolveRequestId } from "./request-id";

function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return { log: createLogger({ level: "info", destination }), lines };
}

describe("structured logger", () => {
  it("emits JSON with level, timestamp, message and context", () => {
    const { log, lines } = captureLogger();
    log.child({ requestId: "req-1" }).info({ status: 200 }, "http.request");
    expect(lines[0]).toMatchObject({
      level: "info",
      message: "http.request",
      requestId: "req-1",
      status: 200,
      service: expect.any(String),
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it("redacts credentials, tokens and auth headers", () => {
    const { log, lines } = captureLogger();
    log.info(
      {
        password: "hunter2-password",
        token: "session-token-value",
        user: { accessToken: "oauth-access", refreshToken: "oauth-refresh" },
        headers: { cookie: "better-auth.session_token=abc", authorization: "Bearer xyz" },
      },
      "sensitive",
    );
    const serialized = JSON.stringify(lines[0]);
    for (const secret of [
      "hunter2-password",
      "session-token-value",
      "oauth-access",
      "oauth-refresh",
      "session_token=abc",
      "Bearer xyz",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain("[REDACTED]");
  });
});

describe("resolveRequestId", () => {
  it("keeps a well-formed inbound id", () => {
    expect(resolveRequestId("trace-1234abcd")).toBe("trace-1234abcd");
  });

  it.each([null, "", "short", "has spaces in it", "line\nbreak-injection", "x".repeat(200)])(
    "replaces an unsafe inbound id (%j) with a UUID",
    (inbound) => {
      expect(resolveRequestId(inbound)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    },
  );
});
