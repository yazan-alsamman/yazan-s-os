import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { paginated, toSkipTake, type PaginationQuery } from "@/lib/http/pagination";

import type { CopilotAnswer } from "./copilot.grounding";

/**
 * Persistence and DTO mapping for Copilot conversations (ADR 0050). Every query is scoped by
 * userId; the composite unique (id, userId) guarantees a foreign id can never be read or written.
 */

export interface CopilotToolCallDto {
  tool: string;
  status: "ok" | "rejected" | "failed";
  resultCount: number | null;
  durationMs: number;
  error: string | null;
}

export interface CopilotMessageDto {
  id: string;
  role: "user" | "assistant";
  content: string | null;
  answer: CopilotAnswer | null;
  mode: "synthesis" | "retrieval_only" | null;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  createdAt: string;
  toolCalls: CopilotToolCallDto[];
}

export interface CopilotConversationListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotConversationDetail extends CopilotConversationListItem {
  messages: CopilotMessageDto[];
}

const messageInclude = {
  toolCalls: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.CopilotMessageInclude;

type MessageRow = Prisma.CopilotMessageGetPayload<{ include: typeof messageInclude }>;
type ConversationRow = Prisma.CopilotConversationGetPayload<{ select: { id: true } }>;

export function toMessageDto(row: MessageRow): CopilotMessageDto {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    answer: (row.answer as CopilotAnswer | null) ?? null,
    mode: row.mode,
    provider: row.provider,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt.toISOString(),
    toolCalls: row.toolCalls.map((t) => ({
      tool: t.tool,
      status: t.status,
      resultCount: t.resultCount,
      durationMs: t.durationMs,
      error: t.error,
    })),
  };
}

export function toListItem(row: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}): CopilotConversationListItem {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const copilotRepository = {
  async list(db: PrismaClient, userId: string, query: PaginationQuery) {
    const where = { userId };
    const [rows, total] = await Promise.all([
      db.copilotConversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        ...toSkipTake(query),
      }),
      db.copilotConversation.count({ where }),
    ]);
    return paginated(rows.map(toListItem), total, query);
  },

  findOwned(
    tx: Prisma.TransactionClient | PrismaClient,
    userId: string,
    id: string,
  ): Promise<ConversationRow | null> {
    return tx.copilotConversation.findFirst({ where: { id, userId }, select: { id: true } });
  },

  async detail(
    db: PrismaClient,
    userId: string,
    id: string,
  ): Promise<CopilotConversationDetail | null> {
    const row = await db.copilotConversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: "asc" }, include: messageInclude } },
    });
    if (!row) return null;
    return { ...toListItem(row), messages: row.messages.map(toMessageDto) };
  },
};
