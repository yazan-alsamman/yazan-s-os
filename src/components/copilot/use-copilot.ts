"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Paginated } from "@/lib/api/hooks";
import { fetchJson, sendJson } from "@/lib/http/fetch-json";
import type {
  CopilotConversationDetail,
  CopilotConversationListItem,
} from "@/modules/copilot/copilot.repository";
import type { AskInput } from "@/modules/copilot/copilot.schemas";
import type { AskResult } from "@/modules/copilot/copilot.service";

/** Query/mutation hooks for the Copilot. One resource key ("copilot") so a mutation refreshes all. */
const KEY = "copilot";

export interface ModelStatus {
  available: boolean;
  provider: string | null;
  model: string | null;
}

export function useModelStatus() {
  return useQuery({
    queryKey: [KEY, "status"],
    queryFn: () => fetchJson<{ data: ModelStatus }>("/api/v1/copilot/status").then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: [KEY, "conversations"],
    queryFn: () =>
      fetchJson<Paginated<CopilotConversationListItem>>(
        "/api/v1/copilot/conversations?pageSize=50",
      ),
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: [KEY, "conversation", id],
    enabled: Boolean(id),
    queryFn: () =>
      fetchJson<{ data: CopilotConversationDetail }>(`/api/v1/copilot/conversations/${id}`).then(
        (r) => r.data,
      ),
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [KEY] });
}

export function useCreateConversation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { title?: string }) =>
      sendJson<{ data: CopilotConversationListItem }>(
        "POST",
        "/api/v1/copilot/conversations",
        body,
      ).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useAsk() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ conversationId, input }: { conversationId: string; input: AskInput }) =>
      sendJson<{ data: AskResult }>(
        "POST",
        `/api/v1/copilot/conversations/${conversationId}/ask`,
        input,
      ).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useRenameConversation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      sendJson("PATCH", `/api/v1/copilot/conversations/${id}`, { title }),
    onSuccess: invalidate,
  });
}

export function useDeleteConversation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => sendJson("DELETE", `/api/v1/copilot/conversations/${id}`),
    onSuccess: invalidate,
  });
}
