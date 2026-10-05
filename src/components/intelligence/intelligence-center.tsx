"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ErrorState, ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { errorMessage } from "@/lib/http/fetch-json";

import {
  useEvidenceCandidates,
  useIntelligenceSignals,
  useLearningPlan,
  useRunIntelligence,
  useUpdateSignal,
  useAcceptCandidate,
  useRejectCandidate,
  useWeeklyReview,
  type CandidateDto,
  type LearningItem,
  type SignalDto,
} from "./use-intelligence";

const SEVERITY_TONE: Record<SignalDto["severity"], "neutral" | "info" | "warning" | "danger"> = {
  info: "neutral",
  attention: "info",
  warning: "warning",
  critical: "danger",
};
const PRIORITY_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

function sourceHref(s: SignalDto): string | null {
  if (!s.sourceId) return null;
  if (s.sourceType === "skill") return `/skills/${s.sourceId}`;
  if (s.sourceType === "opportunity") return `/opportunities/${s.sourceId}`;
  return null;
}

function SignalRow({ signal }: { signal: SignalDto }) {
  const update = useUpdateSignal();
  const href = sourceHref(signal);
  return (
    <li className="flex flex-col gap-1 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[signal.severity]}>{signal.severity}</Badge>
        <span className="font-medium">{signal.title}</span>
        {signal.status !== "active" && <Badge tone="neutral">{signal.status}</Badge>}
      </div>
      <p className="text-caption text-muted-foreground">{signal.explanation}</p>
      <div className="flex flex-wrap items-center gap-2">
        {href && (
          <Link href={href as never} className="text-caption underline underline-offset-4">
            Inspect source
          </Link>
        )}
        {signal.status === "active" && (
          <>
            <Button
              size="xs"
              variant="outline"
              onClick={() => update.mutate({ id: signal.id, status: "reviewed" })}
            >
              Mark reviewed
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => update.mutate({ id: signal.id, status: "dismissed" })}
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function CandidateRow({ candidate }: { candidate: CandidateDto }) {
  const accept = useAcceptCandidate();
  const reject = useRejectCandidate();
  const busy = accept.isPending || reject.isPending;
  return (
    <li className="flex flex-col gap-1 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{candidate.confidence} confidence</Badge>
        <span className="font-medium">{candidate.suggestedTitle}</span>
      </div>
      <p className="text-caption text-muted-foreground">
        From {candidate.sourceType.replace("_", " ")}
        {candidate.repoFullName ? ` · ${candidate.repoFullName}` : ""}
        {candidate.suggestedDate ? ` · ${candidate.suggestedDate}` : ""} — review before it becomes
        evidence.
      </p>
      <div className="flex gap-2">
        <Button size="xs" disabled={busy} onClick={() => accept.mutate({ id: candidate.id })}>
          Accept as evidence
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => reject.mutate({ id: candidate.id })}
        >
          Reject
        </Button>
      </div>
    </li>
  );
}

function WeeklyReviewPanel() {
  const q = useWeeklyReview();
  if (q.isPending) return <ListSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const w = q.data.data;
  const c = w.summary.changed;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h4 font-semibold">
          Weekly executive review · {w.weekStart} → {w.weekEnd}
        </h2>
        <Badge tone={w.status === "partial" ? "warning" : "neutral"}>{w.status}</Badge>
      </div>
      {w.status === "partial" && w.coverage.reasons.length > 0 && (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-caption"
        >
          {w.coverage.reasons.join(" ")}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Evidence created"
          value={c.evidenceCreated.current}
          delta={c.evidenceCreated.delta}
        />
        <Stat label="Evidence accepted" value={c.evidenceAccepted} />
        <Stat
          label="Commits"
          value={c.commits ? c.commits.current : "—"}
          delta={c.commits?.delta}
        />
        <Stat label="Projects updated" value={c.projectsUpdated} />
      </dl>
      {w.summary.attention.upcomingDeadlines.length > 0 && (
        <div>
          <p className="text-caption text-muted-foreground">Upcoming opportunity deadlines</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {w.summary.attention.upcomingDeadlines.map((d) => (
              <li key={d.id} className="text-caption">
                <Link
                  href={`/opportunities/${d.id}` as never}
                  className="underline underline-offset-4"
                >
                  {d.title}
                </Link>{" "}
                · {d.deadline}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, delta }: { label: string; value: number | string; delta?: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-h3 font-semibold tabular">
        {value}
        {delta && delta !== "flat" && (
          <span className={`ml-1 text-caption ${delta === "up" ? "text-success" : "text-danger"}`}>
            {delta === "up" ? "▲" : "▼"}
          </span>
        )}
      </dd>
    </div>
  );
}

function LearningPlanPanel() {
  const q = useLearningPlan();
  if (q.isPending) return <ListSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const items = q.data.data.items;
  if (items.length === 0)
    return (
      <p className="rounded-md border bg-surface p-4 text-muted-foreground">
        No learning gaps detected. Set skill targets or add opportunity requirements to get grounded
        recommendations.
      </p>
    );
  return (
    <ul className="divide-y rounded-lg border bg-surface">
      {items.map((item: LearningItem, i) => (
        <li key={i} className="flex flex-col gap-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={PRIORITY_TONE[item.priority]}>{item.priority}</Badge>
            <span className="font-medium">{item.focus}</span>
          </div>
          <p className="text-caption text-muted-foreground">{item.why}</p>
          <p className="text-caption">
            <span className="text-muted-foreground">Evidence: </span>
            {item.evidenceSays}
          </p>
          <p className="text-caption">
            <span className="text-muted-foreground">Do: </span>
            {item.suggestedAction} <span className="text-muted-foreground">Goal:</span>{" "}
            {item.evidenceGoal}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function IntelligenceCenter() {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("active");
  const signals = useIntelligenceSignals({ severity: severity || undefined, status, pageSize: 50 });
  const candidates = useEvidenceCandidates({ status: "candidate", pageSize: 50 });
  const run = useRunIntelligence();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface p-3">
        <p className="text-caption text-muted-foreground">
          Deterministic, grounded detection over your real PEOS data — nothing here is AI-invented.
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={() => run.mutate({})} disabled={run.isPending}>
            <Sparkles aria-hidden />
            {run.isPending ? "Running…" : "Run detection"}
          </Button>
        </div>
      </div>
      {run.isError && (
        <p role="alert" className="text-caption text-danger">
          {errorMessage(run.error)}
        </p>
      )}

      <WeeklyReviewPanel />

      <section aria-labelledby="signals-h" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="signals-h" className="text-h4 font-semibold">
            Signals
          </h2>
          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label="Severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="attention">Attention</option>
              <option value="info">Info</option>
            </NativeSelect>
            <NativeSelect
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="reviewed">Reviewed</option>
              <option value="dismissed">Dismissed</option>
              <option value="resolved">Resolved</option>
            </NativeSelect>
          </div>
        </div>
        {signals.isPending ? (
          <ListSkeleton rows={4} />
        ) : signals.isError ? (
          <ErrorState error={signals.error} onRetry={() => void signals.refetch()} />
        ) : signals.data.data.length === 0 ? (
          <p className="rounded-md border bg-surface p-6 text-center text-muted-foreground">
            No {status} signals. Run detection, or this simply means nothing needs attention.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-surface">
            {signals.data.data.map((s) => (
              <SignalRow key={s.id} signal={s} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="candidates-h" className="flex flex-col gap-2">
        <h2 id="candidates-h" className="text-h4 font-semibold">
          Evidence candidates
        </h2>
        {candidates.isPending ? (
          <ListSkeleton rows={3} />
        ) : candidates.isError ? (
          <ErrorState error={candidates.error} onRetry={() => void candidates.refetch()} />
        ) : candidates.data.data.length === 0 ? (
          <p className="rounded-md border bg-surface p-6 text-center text-muted-foreground">
            No evidence candidates awaiting review. Run detection after syncing GitHub to extract
            candidates from releases and merged pull requests.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-surface">
            {candidates.data.data.map((c) => (
              <CandidateRow key={c.id} candidate={c} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="learning-h" className="flex flex-col gap-2">
        <h2 id="learning-h" className="text-h4 font-semibold">
          Learning plan
        </h2>
        <LearningPlanPanel />
      </section>
    </div>
  );
}
