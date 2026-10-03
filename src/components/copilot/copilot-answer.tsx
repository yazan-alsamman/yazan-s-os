"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { Citation, StatementKind } from "@/modules/copilot/copilot.grounding";
import type { CopilotMessageDto } from "@/modules/copilot/copilot.repository";

/**
 * Renders a validated assistant answer (ADR 0048). Every statement carries its evidence class,
 * every number and claim is already validated against cited sources server-side, and citations
 * link back to the record they came from. The UI never hides a limitation or a validation notice.
 */

const KIND_LABEL: Record<StatementKind, string> = {
  fact: "Fact",
  derived: "Derived",
  analysis: "Analysis",
  unknown: "Not in data",
  assumption: "Assumption",
};
const KIND_TONE: Record<StatementKind, "success" | "info" | "neutral" | "warning"> = {
  fact: "success",
  derived: "info",
  analysis: "neutral",
  unknown: "warning",
  assumption: "warning",
};
const KIND_HINT: Record<StatementKind, string> = {
  fact: "Stated directly by a record.",
  derived: "A value computed by an authoritative metric.",
  analysis: "The assistant's interpretation of the cited records.",
  unknown: "The data does not contain this.",
  assumption: "An unverified claim, not confirmed by any record.",
};

function CitationChip({ citation }: { citation: Citation }) {
  const label = `${citation.label} (${citation.origin === "derived" ? "metric" : citation.type})`;
  return citation.href ? (
    <Link
      href={citation.href as never}
      className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 text-caption hover:underline"
      title={label}
    >
      {citation.label}
    </Link>
  ) : (
    <span
      className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 text-caption"
      title={label}
    >
      {citation.label}
    </span>
  );
}

export function CopilotAnswerView({ message }: { message: CopilotMessageDto }) {
  const answer = message.answer;
  const [showTools, setShowTools] = useState(false);
  if (!answer) return null;
  const byRef = new Map(answer.citations.map((c) => [c.ref, c]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={answer.mode === "synthesis" ? "info" : "neutral"}>
          {answer.mode === "synthesis" ? "AI synthesis" : "Retrieval only"}
        </Badge>
        {answer.mode === "synthesis" && message.model && (
          <span className="text-caption text-muted-foreground">
            {message.provider} · {message.model}
            {message.latencyMs !== null && ` · ${message.latencyMs} ms`}
            {message.inputTokens !== null &&
              message.outputTokens !== null &&
              ` · ${message.inputTokens}+${message.outputTokens} tokens`}
          </span>
        )}
      </div>

      {answer.notices.length > 0 && (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-caption"
        >
          <p className="font-medium">Grounding checks</p>
          <ul className="mt-1 list-disc pl-5">
            {answer.notices.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {answer.statements.length > 0 && (
        <ul className="flex flex-col gap-2">
          {answer.statements.map((s, i) => {
            const cites = s.sources.map((ref) => byRef.get(ref)).filter((c): c is Citation => !!c);
            return (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <Badge tone={KIND_TONE[s.kind]} title={KIND_HINT[s.kind]}>
                    {KIND_LABEL[s.kind]}
                  </Badge>
                  <p className="text-body">{s.text}</p>
                </div>
                {cites.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pl-1">
                    <span className="text-caption text-muted-foreground">Sources:</span>
                    {cites.map((c) => (
                      <CitationChip key={c.ref} citation={c} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {answer.recommendations.length > 0 && (
        <section aria-label="Recommendations" className="flex flex-col gap-2">
          {answer.recommendations.map((r, i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-3">
              <div className="flex items-center gap-2">
                <Badge tone="info">Recommendation</Badge>
                <Badge
                  tone={
                    r.confidence === "high"
                      ? "success"
                      : r.confidence === "medium"
                        ? "info"
                        : "neutral"
                  }
                >
                  {r.confidence} confidence
                </Badge>
              </div>
              <p className="mt-1 font-medium">{r.recommendation}</p>
              {r.reasoning.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-caption text-muted-foreground">
                  {r.reasoning.map((reason, j) => (
                    <li key={j}>{reason}</li>
                  ))}
                </ul>
              )}
              {r.assumptions.length > 0 && (
                <p className="mt-1 text-caption text-muted-foreground">
                  Assumptions (not in your data): {r.assumptions.join("; ")}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-caption text-muted-foreground">Evidence:</span>
                {r.evidence
                  .map((ref) => byRef.get(ref))
                  .filter((c): c is Citation => !!c)
                  .map((c) => (
                    <CitationChip key={c.ref} citation={c} />
                  ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {answer.unavailable.length > 0 && (
        <div className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-caption">
          <p className="font-medium">Not available in your data</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {answer.unavailable.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      )}

      {answer.statements.length === 0 &&
        answer.recommendations.length === 0 &&
        answer.unavailable.length === 0 && (
          <p className="text-muted-foreground">
            Nothing in your PEOS records answers this. Add the relevant records and ask again.
          </p>
        )}

      {answer.tools.length > 0 && (
        <div className="text-caption">
          <button
            type="button"
            onClick={() => setShowTools((v) => !v)}
            aria-expanded={showTools}
            className="text-muted-foreground underline underline-offset-4"
          >
            {showTools ? "Hide" : "Show"} data lookups ({answer.tools.length})
          </button>
          {showTools && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {answer.tools.map((t, i) => (
                <li key={i} className="text-muted-foreground tabular">
                  {t.tool} ·{" "}
                  <span
                    className={
                      t.status === "ok"
                        ? "text-success"
                        : t.status === "rejected"
                          ? "text-warning"
                          : "text-danger"
                    }
                  >
                    {t.status}
                  </span>
                  {t.count !== null && ` · ${t.count} record${t.count === 1 ? "" : "s"}`}
                  {t.limitation && ` · ${t.limitation}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
