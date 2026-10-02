import { describe, expect, it } from "vitest";

import { AppError, toErrorBody } from "./app-error";

describe("toErrorBody", () => {
  it("maps an AppError to its catalogued status and public message", () => {
    const { status, body } = toErrorBody(new AppError("NOT_FOUND"), "req-1");
    expect(status).toBe(404);
    expect(body).toEqual({
      code: "NOT_FOUND",
      message: "The requested resource does not exist.",
      requestId: "req-1",
    });
  });

  it("includes field details for validation errors", () => {
    const error = new AppError("VALIDATION_FAILED", {
      details: [{ path: "email", message: "Invalid email" }],
    });
    expect(toErrorBody(error, "req-2").body.details).toEqual([
      { path: "email", message: "Invalid email" },
    ]);
  });

  it("never exposes the message of an unknown error", () => {
    const { status, body } = toErrorBody(new Error("connection to 10.0.0.5 refused"), "req-3");
    expect(status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });
});
