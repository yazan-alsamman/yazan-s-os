import { z } from "zod";

import { paginationQuerySchema } from "@/lib/http/pagination";
import { requiredText } from "@/modules/shared/fields";

/**
 * Request/response contracts for the Copilot API (ADR 0050). The question is free text, but the
 * task, focus and portfolio kind are closed enums so the server — not the question — decides the
 * flow. No userId or ownerId is ever accepted from the client (03 §4; always from session).
 */

export const COPILOT_QUESTION_MAX = 1_000;

export const copilotTaskSchema = z.enum(["answer", "recommend", "portfolio"]);
export const portfolioKindSchema = z.enum([
  "case_study",
  "project_summary",
  "cv_bullets",
  "architecture_narrative",
]);

export const copilotFocusSchema = z.object({
  type: z.enum(["project", "skill"]),
  id: z.uuid(),
});

export const listConversationsQuerySchema = paginationQuerySchema;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const createConversationSchema = z.object({
  title: requiredText(200).optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const renameConversationSchema = z.object({
  title: requiredText(200),
});
export type RenameConversationInput = z.infer<typeof renameConversationSchema>;

export const askSchema = z
  .object({
    question: z.string().trim().min(1, "A question is required").max(COPILOT_QUESTION_MAX),
    task: copilotTaskSchema.default("answer"),
    focus: copilotFocusSchema.optional(),
    portfolioKind: portfolioKindSchema.optional(),
  })
  .refine((v) => v.task !== "portfolio" || v.focus?.type === "project", {
    message: "A portfolio request requires a project focus",
    path: ["focus"],
  });
export type AskInput = z.infer<typeof askSchema>;
