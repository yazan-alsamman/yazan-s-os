import { getModelProvider } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { askSchema } from "@/modules/copilot/copilot.schemas";
import { createCopilotService } from "@/modules/copilot/copilot.service";

export const dynamic = "force-dynamic";

interface Params {
  id: string;
}

/**
 * POST /api/v1/copilot/conversations/:id/ask — ask a question within the conversation. The
 * question is free text; the server routes it to controlled tools. Rate-limited (expensive;
 * may call an external model). Returns the persisted assistant message with citations.
 */
export const POST = defineUserRoute<Params>(
  "v1.copilot.ask",
  async ({ request, params, ctx }) =>
    created(
      await createCopilotService(getDb(), getModelProvider()).ask(
        ctx,
        parseId(params.id),
        await parseBody(request, askSchema),
      ),
    ),
  { rateLimit: RateLimits.copilot },
);
