"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDelete } from "@/components/data/confirm-delete";
import {
  BackLink,
  DetailHeader,
  DetailSkeleton,
  ExternalLink,
  FieldGrid,
  formatDate,
  Panel,
  ProvenancePanel,
} from "@/components/data/detail";
import { RelationPicker } from "@/components/data/relation-picker";
import { ErrorState } from "@/components/data/states";
import { EntityFormDialog } from "@/components/forms/entity-form";
import { OPPORTUNITY_FIELDS, REQUIREMENT_FIELDS } from "@/components/records/fields";
import {
  OPPORTUNITY_PRIORITY_OPTIONS,
  OPPORTUNITY_STATUS_OPTIONS,
  OPPORTUNITY_TYPE_OPTIONS,
  REQUIREMENT_IMPORTANCE_OPTIONS,
  REQUIREMENT_KIND_OPTIONS,
  labelOf,
} from "@/components/records/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiGet, useApiItem, useApiMutation } from "@/lib/api/hooks";
import { ApiError } from "@/lib/http/fetch-json";
import type { OpportunityDetailDto } from "@/modules/opportunities/opportunity.repository";

// ── Fit response (mirrors OpportunityService.getFit; kept local to stay client-safe) ───────────
interface NamedRef {
  id: string;
  name?: string;
}
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
  description: string | null;
  importance: "required" | "preferred";
  skill: NamedRef | null;
  technology: NamedRef | null;
  certification: (NamedRef & { issuer?: string }) | null;
  evidence: FitEvidence[];
  suggestions: FitEvidence[];
  status: "supported" | "partial" | "unsupported";
  strength: "strong" | "moderate" | "none";
}
interface CoverageBucket {
  total: number;
  supported: number;
  partial: number;
  unsupported: number;
}
interface Fit {
  calculatedAt: string;
  coverage: { required: CoverageBucket; preferred: CoverageBucket; requiredCoverage: number | null };
  requirements: FitRequirement[];
}

const STATUS_TONE = { supported: "success", partial: "warning", unsupported: "danger" } as const;
const STATUS_LABEL = { supported: "Supported", partial: "Partial", unsupported: "Missing" } as const;
const PRIORITY_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

const asPercent = (v: number) => `${Math.round(v * 1000) / 10}%`;

function CoveragePanel({ coverage }: { coverage: Fit["coverage"] }) {
  const r = coverage.required;
  return (
    <Panel title="Requirement coverage">
      <p className="text-caption text-muted-foreground">
        Coverage counts only <b>required</b> requirements with at least one <b>verified</b> evidence
        item. It is always shown with the full breakdown below — never as a lone score.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-6">
        <div>
          <p className="text-metric font-semibold tabular">
            {coverage.requiredCoverage === null ? "—" : asPercent(coverage.requiredCoverage)}
          </p>
          <p className="text-caption text-muted-foreground">
            {coverage.requiredCoverage === null
              ? "No required requirements yet"
              : `${r.supported} of ${r.total} required supported`}
          </p>
        </div>
        <dl className="flex flex-wrap gap-4 text-caption">
          <Stat label="Required · supported" tone="success" value={r.supported} />
          <Stat label="Required · partial" tone="warning" value={r.partial} />
          <Stat label="Required · missing" tone="danger" value={r.unsupported} />
          <Stat
            label="Preferred"
            tone="neutral"
            value={`${coverage.preferred.supported}/${coverage.preferred.total}`}
          />
        </dl>
      </div>
    </Panel>
  );
}

const STAT_TONE: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-foreground",
};

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-h4 font-semibold tabular ${STAT_TONE[tone] ?? "text-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}

function EvidenceChip({ e }: { e: FitEvidence }) {
  return (
    <Link
      href={`/evidence/${e.id}` as never}
      className="inline-flex items-center gap-1 rounded-md border bg-surface px-2 py-0.5 text-caption hover:bg-surface-sunken"
    >
      {e.verified ? (
        <Badge tone="success">verified</Badge>
      ) : (
        <Badge tone="neutral">unverified</Badge>
      )}
      <span className="truncate max-w-48">{e.title}</span>
      {e.github && <span className="text-muted-foreground">· GitHub</span>}
    </Link>
  );
}

export function OpportunityDossier({ id }: { id: string }) {
  const router = useRouter();
  const path = `/api/v1/opportunities/${id}`;
  const invalidates = ["opportunities", "search", "evidence"];
  const detail = useApiItem<OpportunityDetailDto>("opportunities", path);
  const fitQuery = useApiGet<{ data: Fit }>(["opportunities", "fit", id], `${path}/fit`);

  const update = useApiMutation<Record<string, unknown>>("PATCH", path, invalidates);
  const remove = useApiMutation<void>("DELETE", path, invalidates);
  const addReq = useApiMutation<Record<string, unknown>>("POST", `${path}/requirements`, invalidates);
  const updateReq = useApiMutation<{ reqId: string } & Record<string, unknown>>(
    "PATCH",
    (b) => `${path}/requirements/${b.reqId}`,
    invalidates,
  );
  const deleteReq = useApiMutation<{ reqId: string }>(
    "DELETE",
    (b) => `${path}/requirements/${b.reqId}`,
    invalidates,
  );
  const mapEvidence = useApiMutation<{ reqId: string; evidenceIds: string[] }>(
    "PUT",
    (b) => `${path}/requirements/${b.reqId}/evidence`,
    invalidates,
  );

  const [editingOpp, setEditingOpp] = useState(false);
  const [deletingOpp, setDeletingOpp] = useState(false);
  const [reqForm, setReqForm] = useState<{ mode: "new" } | { mode: "edit"; req: FitRequirement } | null>(null);
  const [evidencePicker, setEvidencePicker] = useState<FitRequirement | null>(null);
  const [linkPicker, setLinkPicker] = useState<FitRequirement | null>(null);
  const [deletingReq, setDeletingReq] = useState<FitRequirement | null>(null);

  if (detail.isPending) return <DetailSkeleton />;
  if (detail.isError) {
    if (detail.error instanceof ApiError && detail.error.status === 404) {
      return (
        <div role="alert" className="rounded-lg border bg-surface p-6">
          <h1 className="text-h2 font-semibold">Not found</h1>
          <p className="mt-1 text-muted-foreground">This opportunity does not exist or was deleted.</p>
        </div>
      );
    }
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  const o = detail.data;
  const fit = fitQuery.data?.data;

  const concreteResource =
    linkPicker?.kind === "technology"
      ? { resource: "technologies", pathUrl: "/api/v1/technologies", field: "technologyId" as const }
      : linkPicker?.kind === "certification"
        ? { resource: "certifications", pathUrl: "/api/v1/certifications", field: "certificationId" as const }
        : { resource: "skills", pathUrl: "/api/v1/skills", field: "skillId" as const };

  const currentLink = (r: FitRequirement) => r.skill ?? r.technology ?? r.certification;

  return (
    <div>
      <BackLink href="/opportunities" label="All opportunities" />
      <DetailHeader
        title={o.title}
        subtitle={o.organization ?? undefined}
        badges={
          <>
            <Badge>{labelOf(OPPORTUNITY_TYPE_OPTIONS, o.type)}</Badge>
            <Badge>{labelOf(OPPORTUNITY_STATUS_OPTIONS, o.status)}</Badge>
            <Badge tone={PRIORITY_TONE[o.priority]}>
              {labelOf(OPPORTUNITY_PRIORITY_OPTIONS, o.priority)} priority
            </Badge>
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/opportunities/${id}/portfolio` as never}>Evidence portfolio</Link>
            </Button>
            <Button variant="outline" onClick={() => setEditingOpp(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setDeletingOpp(true)}>
              <Trash2 aria-hidden />
              Delete
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {fit && <CoveragePanel coverage={fit.coverage} />}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Panel title="Overview">
              <FieldGrid
                items={[
                  { label: "Deadline", value: formatDate(o.deadline) },
                  { label: "Location", value: o.location },
                  { label: "Source", value: o.source },
                  { label: "Link", value: <ExternalLink href={o.sourceUrl} />, wide: true },
                  { label: "Next action", value: o.nextAction, wide: true },
                  { label: "Description", value: o.description, wide: true },
                  { label: "Notes", value: o.notes, wide: true },
                ]}
              />
            </Panel>

            <section aria-labelledby="fit-matrix" className="rounded-lg border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 id="fit-matrix" className="text-h4 font-semibold">
                  Requirements &amp; evidence fit
                </h2>
                <Button size="sm" onClick={() => setReqForm({ mode: "new" })}>
                  <Plus aria-hidden />
                  Add requirement
                </Button>
              </div>

              {!fit ? (
                <p className="text-muted-foreground">Loading fit…</p>
              ) : fit.requirements.length === 0 ? (
                <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
                  No requirements yet. Add the opportunity&rsquo;s requirements, then map your evidence
                  to each one to see a transparent fit — PEOS never invents a match.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {fit.requirements.map((r) => {
                    const link = currentLink(r);
                    return (
                      <li key={r.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                              <span className="font-medium">{r.label}</span>
                              <Badge tone="neutral">{labelOf(REQUIREMENT_KIND_OPTIONS, r.kind)}</Badge>
                              <Badge tone={r.importance === "required" ? "warning" : "neutral"}>
                                {labelOf(REQUIREMENT_IMPORTANCE_OPTIONS, r.importance)}
                              </Badge>
                            </div>
                            {r.description && (
                              <p className="mt-1 text-caption text-muted-foreground">{r.description}</p>
                            )}
                            {link && (
                              <p className="mt-1 text-caption text-muted-foreground">
                                Linked {r.skill ? "skill" : r.technology ? "technology" : "certification"}:{" "}
                                <span className="text-foreground">{link.name}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {r.kind === "skill" || r.kind === "technology" || r.kind === "certification" ? (
                              <Button size="sm" variant="ghost" onClick={() => setLinkPicker(r)}>
                                Link {r.kind}
                              </Button>
                            ) : null}
                            <Button size="sm" variant="ghost" onClick={() => setReqForm({ mode: "edit", req: r })}>
                              <Pencil aria-hidden />
                              <span className="sr-only">Edit requirement</span>
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeletingReq(r)}>
                              <Trash2 aria-hidden />
                              <span className="sr-only">Delete requirement</span>
                            </Button>
                          </div>
                        </div>

                        <div className="mt-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-caption text-muted-foreground">Evidence:</span>
                            {r.evidence.length === 0 ? (
                              <span className="text-caption text-muted-foreground">none mapped</span>
                            ) : (
                              r.evidence.map((e) => <EvidenceChip key={e.id} e={e} />)
                            )}
                            <Button size="sm" variant="outline" onClick={() => setEvidencePicker(r)}>
                              Map evidence
                            </Button>
                          </div>

                          {r.suggestions.length > 0 && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className="text-caption text-muted-foreground">
                                Suggested (linked to {r.skill ? "this skill" : r.technology ? "this technology" : "this certification"}):
                              </span>
                              {r.suggestions.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-caption hover:bg-surface-sunken"
                                  onClick={() =>
                                    mapEvidence.mutate({
                                      reqId: r.id,
                                      evidenceIds: [...r.evidence.map((e) => e.id), s.id],
                                    })
                                  }
                                >
                                  <Plus aria-hidden className="size-3" />
                                  {s.title}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
          <ProvenancePanel provenance={o.provenance} />
        </div>
      </div>

      {/* Opportunity edit / delete */}
      <EntityFormDialog
        open={editingOpp}
        onOpenChange={setEditingOpp}
        title="Edit opportunity"
        fields={OPPORTUNITY_FIELDS}
        initial={o as unknown as Record<string, unknown>}
        submitLabel="Save changes"
        onSubmit={(payload) => update.mutateAsync(payload)}
      />
      <ConfirmDelete
        open={deletingOpp}
        onOpenChange={setDeletingOpp}
        title="Delete opportunity?"
        description="The opportunity, its requirements and evidence mappings will be permanently deleted (your evidence itself is kept). The deletion is recorded in the audit log."
        onConfirm={async () => {
          await remove.mutateAsync();
          router.replace("/opportunities" as never);
        }}
      />

      {/* Requirement create / edit */}
      {reqForm && (
        <EntityFormDialog
          open
          onOpenChange={(open) => !open && setReqForm(null)}
          title={reqForm.mode === "new" ? "Add requirement" : "Edit requirement"}
          fields={REQUIREMENT_FIELDS}
          initial={reqForm.mode === "edit" ? (reqForm.req as unknown as Record<string, unknown>) : {}}
          submitLabel={reqForm.mode === "new" ? "Add requirement" : "Save changes"}
          onSubmit={async (payload) => {
            if (reqForm.mode === "new") await addReq.mutateAsync(payload);
            else await updateReq.mutateAsync({ reqId: reqForm.req.id, ...payload });
            setReqForm(null);
          }}
        />
      )}
      {deletingReq && (
        <ConfirmDelete
          open
          onOpenChange={(open) => !open && setDeletingReq(null)}
          title="Delete requirement?"
          description="The requirement and its evidence mappings will be removed. Your evidence itself is kept."
          onConfirm={async () => {
            await deleteReq.mutateAsync({ reqId: deletingReq.id });
            setDeletingReq(null);
          }}
        />
      )}

      {/* Map evidence to a requirement */}
      {evidencePicker && (
        <RelationPicker
          open
          onOpenChange={(open) => !open && setEvidencePicker(null)}
          title={`Evidence for “${evidencePicker.label}”`}
          description="Map evidence that supports this requirement. Only evidence you own can be mapped; verified evidence counts toward coverage."
          resource="evidence"
          path="/api/v1/evidence"
          optionLabel={(r) => String(r.title)}
          initial={evidencePicker.evidence.map((e) => ({ id: e.id, label: e.title }))}
          onSave={(items) =>
            mapEvidence.mutateAsync({ reqId: evidencePicker.id, evidenceIds: items.map((i) => i.id) })
          }
        />
      )}

      {/* Link a concrete skill/technology/certification */}
      {linkPicker && (
        <RelationPicker
          open
          onOpenChange={(open) => !open && setLinkPicker(null)}
          title={`Link a ${linkPicker.kind}`}
          description="Linking the concrete record lets PEOS suggest evidence already tied to it. Select one."
          resource={concreteResource.resource}
          path={concreteResource.pathUrl}
          optionLabel={(r) => String(r.name)}
          initial={(() => {
            const l = currentLink(linkPicker);
            return l ? [{ id: l.id, label: l.name ?? l.id }] : [];
          })()}
          onSave={(items) =>
            updateReq.mutateAsync({
              reqId: linkPicker.id,
              kind: linkPicker.kind,
              [concreteResource.field]: items[0]?.id ?? null,
            })
          }
        />
      )}
    </div>
  );
}
