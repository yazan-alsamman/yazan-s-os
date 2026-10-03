import { getModelProvider } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { parseBody, parseQuery } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import {
  createConversationSchema,
  listConversationsQuerySchema,
} from "@/modules/copilot/copilot.schemas";
import { createCopilotService } from "@/modules/copilot/copilot.service";

export const dynamic = "force-dynamic";

const service = () => createCopilotService(getDb(), getModelProvider());

/** GET /api/v1/copilot/conversations — the session user's conversations, newest first. */
export const GET = defineUserRoute("v1.copilot.conversations.list", ({ request, ctx }) =>
  service().listConversations(ctx, parseQuery(request, listConversationsQuerySchema)),
);

/** POST /api/v1/copilot/conversations — create a conversation (optional title). */
export const POST = defineUserRoute("v1.copilot.conversations.create", async ({ request, ctx }) =>
  created(await service().create(ctx, await parseBody(request, createConversationSchema))),
);
