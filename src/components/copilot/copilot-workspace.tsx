"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import type { CopilotTask } from "@/modules/copilot/copilot.router";

import { CopilotConversation } from "./copilot-conversation";
import {
  useAsk,
  useConversation,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useModelStatus,
} from "./use-copilot";

function ConversationList({
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const conversations = useConversations();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const rows = conversations.data?.data ?? [];

  return (
    <aside className="flex flex-col gap-2" aria-label="Conversations">
      <Button type="button" size="sm" variant="outline" onClick={onNew}>
        New conversation
      </Button>
      {rows.length === 0 ? (
        <p className="px-1 text-caption text-muted-foreground">No conversations yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((c) => (
            <li key={c.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-current={c.id === activeId}
                className={cn(
                  "flex-1 truncate rounded-md px-2 py-1.5 text-left text-caption hover:bg-accent",
                  c.id === activeId && "bg-accent font-medium",
                )}
                title={c.title}
              >
                {c.title}
              </button>
              {confirmId === c.id ? (
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  onClick={() => {
                    onDelete(c.id);
                    setConfirmId(null);
                  }}
                >
                  Confirm
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete conversation ${c.title}`}
                  onClick={() => setConfirmId(c.id)}
                >
                  ×
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export function CopilotWorkspace() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const status = useModelStatus();
  const conversation = useConversation(activeId);
  const create = useCreateConversation();
  const ask = useAsk();
  const remove = useDeleteConversation();

  const pending = create.isPending || ask.isPending;

  async function handleAsk(question: string, task: CopilotTask) {
    let id = activeId;
    if (!id) {
      const created = await create.mutateAsync({});
      id = created.id;
      setActiveId(id);
    }
    await ask.mutateAsync({ conversationId: id, input: { question, task } });
  }

  function handleDelete(id: string) {
    remove.mutate(id, {
      onSuccess: () => {
        if (id === activeId) setActiveId(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {status.data && !status.data.available && (
        <div
          role="note"
          className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-caption text-muted-foreground"
        >
          No AI model is configured, so answers are assembled directly from your records (retrieval
          only) and cite every source. Configure a provider to enable synthesis.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <ConversationList
          activeId={activeId}
          onSelect={setActiveId}
          onNew={() => setActiveId(null)}
          onDelete={handleDelete}
        />
        <div className="rounded-lg border bg-background p-3">
          <CopilotConversation
            detail={conversation.data ?? null}
            isLoading={Boolean(activeId) && conversation.isPending}
            error={conversation.isError ? conversation.error : null}
            onRetry={() => void conversation.refetch()}
            onAsk={handleAsk}
            pending={pending}
            askError={ask.isError ? ask.error : create.isError ? create.error : null}
          />
        </div>
      </div>
    </div>
  );
}
