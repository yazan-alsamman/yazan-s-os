import { getModelStatus } from "@/lib/ai";
import { defineUserRoute } from "@/lib/http/user-route";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/copilot/status — whether a model is configured (non-secret). The UI uses this to
 * show synthesis vs. retrieval-only mode. Never returns the API key or base URL.
 */
export const GET = defineUserRoute("v1.copilot.status", async () => ({
  data: getModelStatus(),
}));
