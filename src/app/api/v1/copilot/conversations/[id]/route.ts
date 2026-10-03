import { getModelProvider } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { renameConversationSchema } from "@/modules/copilot/copilot.schemas";
import { createCopilotService } from "@/modules/copilot/copilot.service";

export const dynamic = "force-dynamic";

const service = () => createCopilotService(getDb(), getModelProvider());

interface Params {
  id: string;
}

/** GET /api/v1/copilot/conversations/:id — a conversation with its messages and tool activity. */
export const GET = defineUserRoute<Params>(
  "v1.copilot.conversations.get",
  async ({ params, ctx }) => ({ data: await service().getConversation(ctx, parseId(params.id)) }),
);

/** PATCH /api/v1/copilot/conversations/:id — rename. */
export const PATCH = defineUserRoute<Params>(
  "v1.copilot.conversations.rename",
  async ({ request, params, ctx }) => ({
    data: await service().rename(
      ctx,
      parseId(params.id),
      await parseBody(request, renameConversationSchema),
    ),
  }),
);

/** DELETE /api/v1/copilot/conversations/:id — delete the conversation and its messages. */
export const DELETE = defineUserRoute<Params>(
  "v1.copilot.conversations.delete",
  async ({ params, ctx }) => {
    await service().delete(ctx, parseId(params.id));
    return noContent();
  },
);
