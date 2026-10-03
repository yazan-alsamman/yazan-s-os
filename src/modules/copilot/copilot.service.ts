import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ModelProvider } from "@/lib/ai/provider";
import { PROVIDER_ERROR_TEXT, ProviderError } from "@/lib/ai/provider";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  buildMessages,
  citationsFor,
  contextSources,
  retrievalAnswer,
  toolSummary,
  validateAnswer,
  type CopilotAnswer,
} from "./copilot.grounding";
import { redact } from "./copilot.redact";
import {
  copilotRepository as repo,
  toMessageDto,
  toListItem,
  type CopilotMessageDto,
} from "./copilot.repository";
import { routeQuestion } from "./copilot.router";
import type {
  AskInput,
  CreateConversationInput,
  ListConversationsQuery,
  RenameConversationInput,
} from "./copilot.schemas";
import { executeTool, type ExecutedTool } from "./copilot.tools";

/** Upper bound on generated tokens — enough for the structured contract, bounded for cost. */
const MAX_OUTPUT_TOKENS = 1_500;
/** Prior user questions carried into context (bounded). */
const HISTORY_TURNS = 4;
const DEFAULT_TITLE = "New conversation";
const TITLE_MAX = 80;

export interface AskResult {
  conversationId: string;
  message: CopilotMessageDto;
}

/**
 * Copilot orchestration (03 §7; ADRs 0046–0050). The flow is fixed server-side:
 * route → run controlled tools → build bounded, redacted context → (optionally) synthesize →
 * validate every claim against retrieved sources → persist. The model never selects tools,
 * never sees the database, and never decides whose data is read (always ctx.userId).
 */
export function createCopilotService(db: PrismaClient, provider: ModelProvider | null) {
  async function loadDetail(userId: string, id: string) {
    return requireFound(await repo.detail(db, userId, id));
  }

  async function runTools(ctx: ServiceContext, calls: ReturnType<typeof routeQuestion>["calls"]) {
    const executed: ExecutedTool[] = [];
    for (const call of calls) executed.push(await executeTool(db, ctx, call));
    return executed;
  }

  async function history(userId: string, conversationId: string): Promise<string[]> {
    const rows = await db.copilotMessage.findMany({
      where: { userId, conversationId, role: "user" },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
      select: { content: true },
    });
    return rows
      .map((r) => r.content)
      .filter((c): c is string => Boolean(c))
      .reverse();
  }

  /** Try the model; fall back to a deterministic retrieval answer on any failure. */
  async function synthesize(
    input: AskInput,
    executed: ExecutedTool[],
    priorQuestions: string[],
  ): Promise<{
    answer: Omit<CopilotAnswer, "tools" | "citations">;
    usage: {
      provider: string | null;
      model: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
      latencyMs: number | null;
    };
  }> {
    const sources = contextSources(executed);
    const limitations = executed
      .map((t) => t.result?.limitation)
      .filter((l): l is string => Boolean(l));
    const noUsage = {
      provider: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
    };

    const fallback = (notice?: string) => {
      const retrieval = retrievalAnswer(executed);
      return {
        answer: {
          mode: "retrieval_only" as const,
          task: input.task,
          statements: retrieval.statements,
          recommendations: [],
          unavailable: retrieval.unavailable,
          notices: notice ? [notice] : [],
        },
        usage: noUsage,
      };
    };

    if (!provider) return fallback(PROVIDER_ERROR_TEXT.unavailable);
    if (sources.length === 0) {
      // Nothing was retrieved — there is nothing to ground a synthesis on.
      return fallback();
    }

    try {
      const { messages } = buildMessages({
        task: input.task,
        question: input.question,
        history: priorQuestions,
        sources,
        limitations,
        portfolioKind: input.portfolioKind,
      });
      const response = await provider.generate({ messages, maxOutputTokens: MAX_OUTPUT_TOKENS });
      const validated = validateAnswer(response.text, sources);
      if (!validated) return fallback(PROVIDER_ERROR_TEXT.invalid_response);
      return {
        answer: {
          mode: "synthesis",
          task: input.task,
          statements: validated.statements,
          recommendations: validated.recommendations,
          unavailable: validated.unavailable,
          notices: validated.notices,
        },
        usage: {
          provider: response.provider,
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          latencyMs: response.latencyMs,
        },
      };
    } catch (error) {
      if (error instanceof ProviderError) return fallback(PROVIDER_ERROR_TEXT[error.kind]);
      throw error;
    }
  }

  function persist(
    ctx: ServiceContext,
    conversationId: string,
    input: AskInput,
    executed: ExecutedTool[],
    answer: CopilotAnswer,
    usage: {
      provider: string | null;
      model: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
      latencyMs: number | null;
    },
    setTitle: boolean,
  ) {
    return db.$transaction(async (tx) => {
      await tx.copilotMessage.create({
        data: {
          userId: ctx.userId,
          conversationId,
          role: "user",
          content: redact(input.question),
        },
      });
      const assistant = await tx.copilotMessage.create({
        data: {
          userId: ctx.userId,
          conversationId,
          role: "assistant",
          answer: answer as unknown as Prisma.InputJsonValue,
          mode: answer.mode,
          provider: usage.provider,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          latencyMs: usage.latencyMs,
        },
      });
      if (executed.length) {
        await tx.copilotToolCall.createMany({
          data: executed.map((t) => ({
            userId: ctx.userId,
            messageId: assistant.id,
            tool: t.tool,
            input: t.input as Prisma.InputJsonValue,
            status: t.status,
            resultCount: t.result ? t.result.sources.length : null,
            durationMs: t.durationMs,
            error: t.error,
          })),
        });
      }
      await tx.copilotConversation.update({
        where: { id: conversationId },
        data: setTitle ? { title: conversationTitle(input.question) } : { updatedAt: new Date() },
      });
      const row = await tx.copilotMessage.findFirstOrThrow({
        where: { id: assistant.id, userId: ctx.userId },
        include: { toolCalls: { orderBy: { createdAt: "asc" } } },
      });
      return toMessageDto(row);
    });
  }

  return {
    listConversations(ctx: ServiceContext, query: ListConversationsQuery) {
      return repo.list(db, ctx.userId, query);
    },

    getConversation(ctx: ServiceContext, id: string) {
      return loadDetail(ctx.userId, id);
    },

    create(ctx: ServiceContext, input: CreateConversationInput) {
      return db.$transaction(async (tx) => {
        const conversation = await tx.copilotConversation.create({
          data: { userId: ctx.userId, title: input.title?.trim() || DEFAULT_TITLE },
        });
        await auditConversation(tx, ctx, "created", conversation.id);
        return toListItem(conversation);
      });
    },

    rename(ctx: ServiceContext, id: string, input: RenameConversationInput) {
      return db.$transaction(async (tx) => {
        requireFound(await repo.findOwned(tx, ctx.userId, id));
        const updated = await tx.copilotConversation.update({
          where: { id },
          data: { title: input.title.trim() },
        });
        return toListItem(updated);
      });
    },

    delete(ctx: ServiceContext, id: string) {
      return db.$transaction(async (tx) => {
        requireFound(await repo.findOwned(tx, ctx.userId, id));
        await tx.copilotConversation.delete({ where: { id } });
        await auditConversation(tx, ctx, "deleted", id);
      });
    },

    /** Ask a question within an owned conversation. */
    async ask(ctx: ServiceContext, conversationId: string, input: AskInput): Promise<AskResult> {
      requireFound(await repo.findOwned(db, ctx.userId, conversationId));
      const existing = await db.copilotMessage.count({
        where: { userId: ctx.userId, conversationId },
      });
      const plan = routeQuestion(input.question, { task: input.task, focus: input.focus });
      const executed = await runTools(ctx, plan.calls);
      const priorQuestions = await history(ctx.userId, conversationId);
      const { answer: core, usage } = await synthesize(input, executed, priorQuestions);

      const sources = contextSources(executed);
      const byRef = new Map(sources.map((s) => [s.ref, s]));
      const refs = [
        ...core.statements.flatMap((s) => s.sources),
        ...core.recommendations.flatMap((r) => r.evidence),
      ];
      const answer: CopilotAnswer = {
        ...core,
        citations: citationsFor(refs, byRef),
        tools: toolSummary(executed),
      };
      const message = await persist(
        ctx,
        conversationId,
        input,
        executed,
        answer,
        usage,
        existing === 0,
      );
      return { conversationId, message };
    },
  };
}

function conversationTitle(question: string): string {
  const clean = redact(question).replace(/\s+/g, " ").trim();
  return (clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean) || DEFAULT_TITLE;
}

function auditConversation(tx: Tx, ctx: ServiceContext, verb: "created" | "deleted", id: string) {
  return auditInTx(tx, ctx, { entity: "copilot_conversation", verb, entityId: id });
}
