"use client";

import { useState } from "react";

import { formatDate } from "@/components/data/detail";
import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/http/fetch-json";

import { GoogleError } from "./not-connected";
import {
  useModifyMessage,
  useSendEmail,
  useThread,
  useThreads,
  type MailMessage,
} from "./use-google";

const LABELS = [
  { id: "INBOX", label: "Inbox" },
  { id: "STARRED", label: "Starred" },
  { id: "IMPORTANT", label: "Important" },
  { id: "SENT", label: "Sent" },
  { id: "DRAFT", label: "Drafts" },
];

function Compose({
  initial,
  onDone,
}: {
  initial?: Partial<{ to: string; subject: string; inReplyTo: string; references: string }>;
  onDone: () => void;
}) {
  const send = useSendEmail();
  const [to, setTo] = useState(initial?.to ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function confirmSend() {
    await send.mutateAsync({
      to,
      subject,
      body,
      inReplyTo: initial?.inReplyTo,
      references: initial?.references,
    });
    onDone();
  }

  return (
    <section aria-label="Compose email" className="rounded-lg border bg-surface p-3">
      <div className="flex flex-col gap-2">
        <label className="text-caption text-muted-foreground" htmlFor="c-to">
          To
        </label>
        <Input
          id="c-to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="name@example.com"
        />
        <label className="text-caption text-muted-foreground" htmlFor="c-subj">
          Subject
        </label>
        <Input id="c-subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <label className="text-caption text-muted-foreground" htmlFor="c-body">
          Message
        </label>
        <Textarea id="c-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {confirming ? (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-caption">
          <p className="font-medium">Send this email?</p>
          <p className="text-muted-foreground">
            To <b>{to || "—"}</b> · Subject “{subject || "(no subject)"}” · via Gmail. This sends
            immediately.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={confirmSend} disabled={send.isPending || !to}>
              {send.isPending ? "Sending…" : "Confirm send"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => setConfirming(true)} disabled={!to}>
            Review &amp; send
          </Button>
          <Button size="sm" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </div>
      )}
      {send.isError && (
        <p role="alert" className="mt-2 text-caption text-danger">
          {errorMessage(send.error)}
        </p>
      )}
    </section>
  );
}

function MessageView({ m }: { m: MailMessage }) {
  const [showHtml, setShowHtml] = useState(true);
  return (
    <article className="rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{m.from ?? "Unknown sender"}</span>
        <span className="text-caption text-muted-foreground">
          {m.date ? formatDate(m.date) : ""}
        </span>
      </div>
      <p className="text-caption text-muted-foreground">
        To: {m.to ?? "—"}
        {m.cc ? ` · Cc: ${m.cc}` : ""}
      </p>
      {m.html && m.text && (
        <button
          type="button"
          onClick={() => setShowHtml((v) => !v)}
          className="mt-1 text-caption underline underline-offset-4"
        >
          {showHtml ? "View plain text" : "View formatted"}
        </button>
      )}
      {m.html && showHtml ? (
        // Sanitized server-side (sanitize-html); safe to render.
        <div
          className="prose prose-sm mt-2 max-w-none break-words"
          dangerouslySetInnerHTML={{ __html: m.html }}
        />
      ) : (
        <pre className="mt-2 font-sans text-body break-words whitespace-pre-wrap">
          {m.text ?? m.snippet}
        </pre>
      )}
      {m.attachments.length > 0 && (
        <p className="mt-2 text-caption text-muted-foreground">
          Attachments:{" "}
          {m.attachments.map((a) => `${a.filename} (${Math.round(a.size / 1024)} KB)`).join(", ")}
        </p>
      )}
      <p className="mt-1 text-caption text-muted-foreground">
        Source: Gmail · {m.provenance.externalRef}
      </p>
    </article>
  );
}

export function EmailWorkspace() {
  const [label, setLabel] = useState("INBOX");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState<MailMessage | null>(null);

  const threads = useThreads({
    label: search ? undefined : label,
    q: search || undefined,
    maxResults: 20,
  });
  const thread = useThread(threadId);
  const modify = useModifyMessage();

  if (threads.isError)
    return <GoogleError error={threads.error} onRetry={() => void threads.refetch()} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <aside className="flex flex-col gap-2" aria-label="Mailboxes">
        <Button
          size="sm"
          onClick={() => {
            setComposing(true);
            setReplyTo(null);
          }}
        >
          Compose
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
            setThreadId(null);
          }}
          className="flex gap-1"
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search mail…"
            aria-label="Search mail"
          />
          <Button size="sm" variant="outline" type="submit">
            Go
          </Button>
        </form>
        <nav aria-label="Labels" className="flex flex-col">
          {LABELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLabel(l.id);
                setSearch("");
                setQ("");
                setThreadId(null);
              }}
              aria-current={!search && label === l.id}
              className={`rounded px-2 py-1.5 text-left text-caption hover:bg-accent ${!search && label === l.id ? "bg-accent font-medium" : ""}`}
            >
              {l.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex flex-col gap-3">
        {composing && <Compose onDone={() => setComposing(false)} />}
        {replyTo && (
          <Compose
            initial={{
              to: replyTo.from ?? "",
              subject: replyTo.subject?.startsWith("Re:")
                ? replyTo.subject
                : `Re: ${replyTo.subject ?? ""}`,
              inReplyTo: replyTo.messageIdHeader ?? undefined,
              references: replyTo.references ?? replyTo.messageIdHeader ?? undefined,
            }}
            onDone={() => setReplyTo(null)}
          />
        )}

        {threadId ? (
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => setThreadId(null)}
            >
              ← Back to list
            </Button>
            {thread.isPending ? (
              <ListSkeleton rows={4} />
            ) : thread.isError ? (
              <GoogleError error={thread.error} onRetry={() => void thread.refetch()} />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {thread.data.messages.at(-1) && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReplyTo(thread.data!.messages.at(-1)!)}
                      >
                        Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          modify.mutate({
                            id: thread.data!.messages.at(-1)!.id,
                            star: !thread.data!.messages.at(-1)!.starred,
                          })
                        }
                      >
                        {thread.data.messages.at(-1)!.starred ? "Unstar" : "Star"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          modify.mutate({ id: thread.data!.messages.at(-1)!.id, archive: true })
                        }
                      >
                        Archive
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          modify.mutate({ id: thread.data!.messages.at(-1)!.id, read: true })
                        }
                      >
                        Mark read
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {thread.data.messages.map((m) => (
                    <MessageView key={m.id} m={m} />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : threads.isPending ? (
          <ListSkeleton rows={8} />
        ) : threads.data.data.length === 0 ? (
          <p className="p-4 text-muted-foreground">No conversations here.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {threads.data.data.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setThreadId(t.id)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-accent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate ${t.unread ? "font-semibold" : ""}`}>
                      {t.from ?? "—"}
                    </span>
                    <span className="shrink-0 text-caption text-muted-foreground">
                      {t.date ? formatDate(t.date) : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {t.starred && <Badge tone="warning">★</Badge>}
                    {t.unread && <Badge tone="info">New</Badge>}
                    <span className={`truncate ${t.unread ? "font-medium" : ""}`}>
                      {t.subject ?? "(no subject)"}
                    </span>
                  </span>
                  <span className="truncate text-caption text-muted-foreground">{t.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {threads.data && (
          <p className="text-caption text-muted-foreground">
            Fetched live {new Date(threads.data.fetchedAt).toLocaleTimeString()} · Gmail is the
            source of truth.
          </p>
        )}
      </div>
    </div>
  );
}
