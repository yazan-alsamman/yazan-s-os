"use client";

import Link from "next/link";

import { BackLink, DetailSkeleton, formatDate } from "@/components/data/detail";
import { ErrorState } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiGet } from "@/lib/api/hooks";

interface FitEvidence {
  id: string;
  title: string;
  type: string;
  date: string | null;
  verified: boolean;
  github: boolean;
}
interface FitRequirement {
  id: string;
  kind: string;
  label: string;
  importance: "required" | "preferred";
  status: "supported" | "partial" | "unsupported";
  evidence: FitEvidence[];
}
interface Fit {
  calculatedAt: string;
  opportunity: { id: string; title: string; organization: string | null; status: string; type: string };
  coverage: {
    required: { total: number; supported: number; partial: number; unsupported: number };
    preferred: { total: number; supported: number; partial: number; unsupported: number };
    requiredCoverage: number | null;
  };
  requirements: FitRequirement[];
}

const STATUS_LABEL = { supported: "Supported", partial: "Partial", unsupported: "Not yet evidenced" } as const;

function toMarkdown(fit: Fit): string {
  const lines: string[] = [];
  lines.push(`# Evidence portfolio — ${fit.opportunity.title}`);
  if (fit.opportunity.organization) lines.push(`**Organization:** ${fit.opportunity.organization}`);
  lines.push(`_Generated ${new Date(fit.calculatedAt).toLocaleString()} from verified PEOS records._`);
  const c = fit.coverage;
  lines.push(
    `\n**Required coverage:** ${c.requiredCoverage === null ? "n/a" : `${Math.round(c.requiredCoverage * 100)}%`} ` +
      `(${c.required.supported}/${c.required.total} required supported; ${c.required.partial} partial; ${c.required.unsupported} missing)`,
  );
  lines.push("\n## Requirements\n");
  for (const r of fit.requirements) {
    lines.push(`### ${r.label}  _(${r.importance} · ${r.kind})_ — ${STATUS_LABEL[r.status]}`);
    if (r.evidence.length === 0) lines.push("- (no evidence mapped yet)");
    for (const e of r.evidence) {
      lines.push(
        `- ${e.verified ? "✓ verified" : "unverified"} — ${e.title}` +
          `${e.date ? ` (${e.date})` : ""}${e.github ? " [GitHub]" : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function download(fit: Fit) {
  try {
    const blob = new Blob([toMarkdown(fit)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${fit.opportunity.title.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    /* clipboard/file APIs can be blocked; the on-screen portfolio remains available */
  }
}

export function OpportunityPortfolio({ id }: { id: string }) {
  const q = useApiGet<{ data: Fit }>(["opportunities", "fit", id], `/api/v1/opportunities/${id}/fit`);
  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const fit = q.data.data;
  const c = fit.coverage;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <BackLink href={`/opportunities/${id}`} label="Back to opportunity" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => download(fit)}>
            Download Markdown
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Print / Save PDF
          </Button>
        </div>
      </div>

      <article className="rounded-lg border bg-surface p-6">
        <header className="border-b pb-3">
          <h1 className="text-h2 font-semibold">{fit.opportunity.title}</h1>
          {fit.opportunity.organization && (
            <p className="text-muted-foreground">{fit.opportunity.organization}</p>
          )}
          <p className="mt-1 text-caption text-muted-foreground">
            Generated {new Date(fit.calculatedAt).toLocaleString()} from your PEOS records. Every item
            below links to real, owner-held evidence — nothing is fabricated or rephrased into claims.
          </p>
          <p className="mt-2 text-caption">
            <b>Required coverage:</b>{" "}
            {c.requiredCoverage === null ? "n/a" : `${Math.round(c.requiredCoverage * 100)}%`} —{" "}
            {c.required.supported}/{c.required.total} required supported, {c.required.partial} partial,{" "}
            {c.required.unsupported} missing.
          </p>
        </header>

        {fit.requirements.length === 0 ? (
          <p className="pt-4 text-muted-foreground">No requirements have been added yet.</p>
        ) : (
          <ul className="flex flex-col gap-4 pt-4">
            {fit.requirements.map((r) => (
              <li key={r.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-h4 font-semibold">{r.label}</h2>
                  <Badge tone={r.importance === "required" ? "warning" : "neutral"}>{r.importance}</Badge>
                  <Badge
                    tone={r.status === "supported" ? "success" : r.status === "partial" ? "warning" : "danger"}
                  >
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </div>
                <ul className="mt-1 ml-4 list-disc text-body">
                  {r.evidence.length === 0 ? (
                    <li className="text-muted-foreground">No evidence mapped yet.</li>
                  ) : (
                    r.evidence.map((e) => (
                      <li key={e.id}>
                        <Link href={`/evidence/${e.id}` as never} className="hover:underline">
                          {e.title}
                        </Link>
                        {e.date ? ` · ${formatDate(e.date)}` : ""}{" "}
                        {e.verified ? (
                          <Badge tone="success">verified</Badge>
                        ) : (
                          <Badge tone="neutral">unverified</Badge>
                        )}
                        {e.github && <span className="text-muted-foreground"> · GitHub</span>}
                      </li>
                    ))
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}
