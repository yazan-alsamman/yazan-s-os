import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/modules/shared/service-context";

import { executeTool, TOOL_NAMES } from "./copilot.tools";

/** The security boundary: unknown tools and invalid inputs are rejected before any DB access. */
const ctx: ServiceContext = { userId: "u1", requestId: "r1" };
// A DB that throws if touched — proves these branches never reach the database.
const db = new Proxy(
  {},
  {
    get() {
      throw new Error("database must not be accessed for a rejected tool call");
    },
  },
) as unknown as PrismaClient;

describe("executeTool guard", () => {
  it("exposes exactly the twelve controlled tools", () => {
    expect(TOOL_NAMES).toHaveLength(12);
  });

  it("rejects an unknown tool without touching the database", async () => {
    const result = await executeTool(db, ctx, { tool: "dropTables", input: {} });
    expect(result.status).toBe("rejected");
    expect(result.error).toBe("Unknown tool");
  });

  it("rejects malformed input without touching the database", async () => {
    const result = await executeTool(db, ctx, { tool: "getProject", input: { id: 123 } });
    expect(result.status).toBe("rejected");
    expect(result.error).toBe("Invalid tool input");
  });

  it("never carries a user/owner argument into a tool input", async () => {
    const result = await executeTool(db, ctx, {
      tool: "searchProjects",
      input: { userId: "someone-else" },
    });
    // Extra keys are stripped by the strict input schema → input is empty, not forwarded.
    expect(result.status).toBe("rejected");
  });
});
