"use client";

import { useState, type FormEvent } from "react";

import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { CopilotConversationDetail } from "@/modules/copilot/copilot.repository";
import type { CopilotTask } from "@/modules/copilot/copilot.router";
import { COPILOT_QUESTION_MAX } from "@/modules/copilot/copilot.schemas";

import { CopilotAnswerView } from "./copilot-answer";

const SUGGESTED: { label: string; question: string; task: CopilotTask }[] = [
  { label: "Project delivery", question: "How many projects have I shipped?", task: "answer" },
  { label: "Skill gaps", question: "Which skills are below their target level?", task: "answer" },
  { label: "Evidence", question: "What verified evidence do I have?", task: "answer" },
  { label: "What next?", question: "What should I focus on next?", task: "recommend" },
];

const TASKS: { value: CopilotTask; label: string }[] = [
  { value: "answer", label: "Answer" },
  { value: "recommend", label: "Recommend" },
];

function Composer({
  onAsk,
  pending,
  disabled,
}: {
  onAsk: (question: string, task: CopilotTask) => void;
  pending: boolean;
  disabled: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [task, setTask] = useState<CopilotTask>("answer");

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    onAsk(trimmed, task);
    setQuestion("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Mode">
        {TASKS.map((t) => (
          <Button
            key={t.value}
            type="button"
            size="xs"
            variant={task === t.value ? "default" : "outline"}
            role="radio"
            aria-checked={task === t.value}
            onClick={() => setTask(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <label htmlFor="copilot-question" className="sr-only">
        Ask a question about your engineering records
      </label>
      <Textarea
        id="copilot-question"
        value={question}
        maxLength={COPILOT_QUESTION_MAX}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        rows={2}
        placeholder="Ask about your projects, skills, evidence, goals, experiments or decisions…"
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        <span className="text-caption text-muted-foreground">
          Grounded in your records. ⌘/Ctrl + Enter to send.
        </span>
        <Button type="submit" size="sm" disabled={pending || disabled || !question.trim()}>
          {pending ? "Thinking…" : "Ask"}
        </Button>
      </div>
    </form>
  );
}

export function CopilotConversation({
  detail,
  isLoading,
  error,
  onRetry,
  onAsk,
  pending,
  askError,
}: {
  detail: CopilotConversationDetail | null;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onAsk: (question: string, task: CopilotTask) => void;
  pending: boolean;
  askError: unknown;
}) {
  const messages = detail?.messages ?? [];

  return (
    <div className="flex h-full min-h-[28rem] flex-col gap-3">
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : messages.length === 0 && !pending ? (
          <div className="rounded-lg border border-dashed bg-surface p-6 text-center">
            <h2 className="text-h3 font-semibold">Ask your engineering OS</h2>
            <p className="mx-auto mt-1 max-w-prose text-muted-foreground">
              Every answer is built from your PEOS records and cites them. The assistant never
              invents a project, metric, date or achievement — if the data is missing, it says so.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SUGGESTED.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onAsk(s.question, s.task)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground">
                    {m.content}
                  </div>
                </li>
              ) : (
                <li key={m.id} className="rounded-lg border bg-surface p-3">
                  <CopilotAnswerView message={m} />
                </li>
              ),
            )}
            {pending && (
              <li className="rounded-lg border bg-surface p-3" aria-live="polite">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-4 w-full" />
              </li>
            )}
          </ul>
        )}
      </div>
      {askError ? (
        <p role="alert" className="text-caption text-danger">
          {askError instanceof Error ? askError.message : "The request failed."}
        </p>
      ) : null}
      <Composer onAsk={onAsk} pending={pending} disabled={Boolean(error)} />
    </div>
  );
}
