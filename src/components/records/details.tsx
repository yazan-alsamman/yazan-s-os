"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { MetricDefinitionProvider } from "@/components/command-center/metric-definition";
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
  RelationPanel,
  type RelationItem,
} from "@/components/data/detail";
import { RelationPicker, type PickedItem } from "@/components/data/relation-picker";
import { ErrorState } from "@/components/data/states";
import { EntityFormDialog, type FieldDescriptor } from "@/components/forms/entity-form";
import {
  BAND_TONE,
  DeliveryPanel,
  DossierNav,
  DossierSection,
  EvidencePanel,
  HealthPanel,
  LifecyclePanel,
  ProjectActivity,
  useProjectIntelligence,
} from "@/components/projects/dossier";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiItem, useApiMutation } from "@/lib/api/hooks";
import { ApiError } from "@/lib/http/fetch-json";
import type { CertificationDetailDto } from "@/modules/certifications/certification.repository";
import type { EvidenceDetailDto } from "@/modules/evidence/evidence.repository";
import type { ExperienceDetailDto } from "@/modules/experiences/experience.repository";
import type { ProjectDetailDto } from "@/modules/projects/project.dto";
import type { SkillDetailDto } from "@/modules/skills/skill.repository";
import type { TechnologyDetailDto } from "@/modules/technologies/technology.repository";

import {
  CERTIFICATION_FIELDS,
  EVIDENCE_FIELDS,
  EXPERIENCE_FIELDS,
  PROJECT_FIELDS,
  SKILL_FIELDS,
  TECHNOLOGY_FIELDS,
} from "./fields";
import {
  CERTIFICATION_STATUS_OPTIONS,
  EVIDENCE_STRENGTH_OPTIONS,
  EVIDENCE_TYPE_OPTIONS,
  EXPIRY_OPTIONS,
  labelOf,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  USAGE_TYPE_OPTIONS,
} from "./options";

/** Shared detail scaffolding: load, edit dialog, delete confirmation, not-found handling. */
function useDetail<T extends { id: string }>(
  resource: string,
  path: string,
  related: readonly string[],
) {
  const query = useApiItem<T>(resource, path);
  const invalidates = [resource, "search", ...related];
  const update = useApiMutation<Record<string, unknown>>("PATCH", path, invalidates);
  const remove = useApiMutation<void>("DELETE", path, invalidates);
  return { query, update, remove, invalidates };
}

function DetailFrame<T>({
  query,
  backHref,
  backLabel,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: T; refetch: () => unknown };
  backHref: string;
  backLabel: string;
  children: (data: T) => ReactNode;
}) {
  return (
    <div>
      <BackLink href={backHref} label={backLabel} />
      {query.isPending ? (
        <DetailSkeleton />
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.status === 404 ? (
          <div role="alert" className="rounded-lg border bg-surface p-6">
            <h1 className="text-h2 font-semibold">Not found</h1>
            <p className="mt-1 text-muted-foreground">This record does not exist or was deleted.</p>
          </div>
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )
      ) : (
        children(query.data as T)
      )}
    </div>
  );
}

function EditDeleteActions({
  label,
  fields,
  entity,
  onSave,
  onDelete,
  afterDelete,
}: {
  label: string;
  fields: readonly FieldDescriptor[];
  entity: Record<string, unknown>;
  onSave: (payload: Record<string, unknown>) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  afterDelete: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
        Edit
      </Button>
      <Button variant="outline" onClick={() => setDeleting(true)}>
        <Trash2 aria-hidden />
        Delete
      </Button>
      <EntityFormDialog
        open={editing}
        onOpenChange={setEditing}
        title={`Edit ${label}`}
        fields={fields}
        initial={entity}
        submitLabel="Save changes"
        onSubmit={onSave}
      />
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${label}?`}
        description="The record and its relationships will be permanently deleted. The deletion is recorded in the audit log."
        onConfirm={async () => {
          await onDelete();
          router.replace(afterDelete as never);
        }}
      />
    </>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  return origin === "import" ? <Badge tone="info">Imported</Badge> : <Badge>Manual</Badge>;
}

const evidenceItem = (e: {
  id: string;
  title: string;
  type: string;
  verified: boolean;
}): RelationItem => ({
  id: e.id,
  label: e.title,
  href: `/evidence/${e.id}`,
  meta: (
    <>
      <Badge>{labelOf(EVIDENCE_TYPE_OPTIONS, e.type)}</Badge>
      {e.verified && <Badge tone="success">Verified</Badge>}
    </>
  ),
});

// ── Project ────────────────────────────────────────────────────────────────

export function ProjectDetail({ id }: { id: string }) {
  const path = `/api/v1/projects/${id}`;
  const { query, update, remove, invalidates } = useDetail<ProjectDetailDto>("projects", path, [
    "skills",
    "technologies",
    "evidence",
  ]);
  const [picker, setPicker] = useState<"skills" | "technologies" | "evidence" | null>(null);
  const setSkills = useApiMutation<{ skillIds: string[] }>("PUT", `${path}/skills`, invalidates);
  const setTechs = useApiMutation<{ technologies: { technologyId: string; usageType?: string }[] }>(
    "PUT",
    `${path}/technologies`,
    invalidates,
  );
  const setEvidence = useApiMutation<{ evidenceIds: string[] }>(
    "PUT",
    `${path}/evidence`,
    invalidates,
  );

  const intel = useProjectIntelligence(id);

  return (
    <MetricDefinitionProvider>
      <DetailFrame query={query} backHref="/projects" backLabel="All projects">
        {(p) => (
          <>
            <DetailHeader
              title={p.name}
              subtitle={<span className="font-mono text-caption">{p.slug}</span>}
              badges={
                <>
                  <Badge>{labelOf(PROJECT_STATUS_OPTIONS, p.status)}</Badge>
                  <Badge>Manual health: {labelOf(PROJECT_HEALTH_OPTIONS, p.healthStatus)}</Badge>
                  {intel.data?.data.health.computed.band && (
                    <Badge tone={BAND_TONE[intel.data.data.health.computed.band]}>
                      Computed: {intel.data.data.health.computed.score}/100
                    </Badge>
                  )}
                  <OriginBadge origin={p.origin} />
                </>
              }
              actions={
                <EditDeleteActions
                  label="project"
                  fields={PROJECT_FIELDS}
                  entity={p}
                  onSave={(payload) => update.mutateAsync(payload)}
                  onDelete={() => remove.mutateAsync()}
                  afterDelete="/projects"
                />
              }
            />
            <DossierNav />
            <div className="flex flex-col gap-8">
              <DossierSection id="overview" title="Overview">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="flex flex-col gap-4 lg:col-span-2">
                    <Panel title="Identity">
                      <FieldGrid
                        items={[
                          { label: "Description", value: p.description, wide: true },
                          { label: "Problem", value: p.problem, wide: true },
                          { label: "Solution", value: p.solution, wide: true },
                          { label: "Impact", value: p.impact, wide: true },
                        ]}
                      />
                    </Panel>
                    {intel.data ? (
                      <LifecyclePanel intel={intel.data.data} />
                    ) : intel.isError ? (
                      <ErrorState error={intel.error} onRetry={() => void intel.refetch()} />
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-4">
                    <Panel title="Links">
                      <FieldGrid
                        items={[
                          {
                            label: "Repository",
                            value: <ExternalLink href={p.repositoryUrl} />,
                            wide: true,
                          },
                          { label: "Demo", value: <ExternalLink href={p.demoUrl} />, wide: true },
                          {
                            label: "Production",
                            value: <ExternalLink href={p.productionUrl} />,
                            wide: true,
                          },
                        ]}
                      />
                    </Panel>
                    <ProvenancePanel provenance={p.provenance} />
                  </div>
                </div>
              </DossierSection>

              {intel.isPending ? (
                <DetailSkeleton />
              ) : intel.isError ? null : (
                <>
                  <DossierSection
                    id="health"
                    title="Health"
                    description="Your manual assessment and the computed signal, side by side. Neither changes the other."
                  >
                    <HealthPanel
                      manual={intel.data.data.health.manual}
                      computed={intel.data.data.health.computed}
                    />
                  </DossierSection>
                  <DossierSection
                    id="delivery"
                    title="Delivery"
                    description="Milestones, overdue work and delivery rate (completed ÷ completed-or-overdue)."
                  >
                    <span id="milestones" className="sr-only" />
                    <DeliveryPanel projectId={p.id} intel={intel.data.data} />
                  </DossierSection>
                </>
              )}

              <DossierSection
                id="context"
                title="Engineering context"
                description="Skills demonstrated and technologies used. Usage shows where a technology was applied, not a proficiency score."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <RelationPanel
                    title="Technologies"
                    items={p.technologies.map((t) => {
                      const others =
                        intel.data?.data.technologies.find((x) => x.id === t.id)?.otherProjects ??
                        null;
                      return {
                        id: t.id,
                        label: t.version ? `${t.name} ${t.version}` : t.name,
                        href: `/skills/technologies/${t.id}`,
                        meta: (
                          <>
                            <Badge>{labelOf(USAGE_TYPE_OPTIONS, t.usageType)}</Badge>
                            {others !== null && (
                              <Link
                                href={`/projects?technologyId=${t.id}` as never}
                                className="text-muted-foreground underline underline-offset-4"
                              >
                                {others === 0
                                  ? "Only this project"
                                  : `Also in ${others} other project${others === 1 ? "" : "s"}`}
                              </Link>
                            )}
                          </>
                        ),
                      };
                    })}
                    emptyText="No technologies linked yet."
                    onManage={() => setPicker("technologies")}
                    manageLabel="Manage technologies"
                  />
                  <RelationPanel
                    title="Skills"
                    items={p.skills.map((s) => ({
                      id: s.id,
                      label: s.name,
                      href: `/skills/${s.id}`,
                      meta: s.category && <Badge>{s.category}</Badge>,
                    }))}
                    emptyText="No skills linked yet."
                    onManage={() => setPicker("skills")}
                    manageLabel="Manage skills"
                  />
                </div>
                <p className="text-caption text-muted-foreground">
                  Architecture decisions and AI experiments for this project arrive with
                  Architecture Intelligence (Phase 7) and the AI Lab (Phase 6).
                </p>
              </DossierSection>

              <DossierSection
                id="evidence"
                title="Evidence"
                description="Only evidence linked to this project is counted."
              >
                {intel.data && <EvidencePanel projectId={p.id} intel={intel.data.data} />}
                <RelationPanel
                  title="Linked evidence"
                  items={p.evidence.map(evidenceItem)}
                  emptyText="No evidence linked yet."
                  onManage={() => setPicker("evidence")}
                  manageLabel="Manage evidence"
                />
              </DossierSection>

              <DossierSection
                id="activity"
                title="Activity"
                description="Your recorded changes to this project and its milestones (from the audit log)."
              >
                <ProjectActivity projectId={p.id} />
              </DossierSection>
            </div>

            <RelationPicker
              open={picker === "skills"}
              onOpenChange={(o) => !o && setPicker(null)}
              title="Project skills"
              description="Select every skill this project demonstrates."
              resource="skills"
              path="/api/v1/skills"
              optionLabel={(r) => String(r.name)}
              initial={p.skills.map((s) => ({ id: s.id, label: s.name }))}
              onSave={(items) => setSkills.mutateAsync({ skillIds: items.map((i) => i.id) })}
            />
            <RelationPicker
              open={picker === "technologies"}
              onOpenChange={(o) => !o && setPicker(null)}
              title="Project technologies"
              description="Select the technologies used and how they were used."
              resource="technologies"
              path="/api/v1/technologies"
              optionLabel={(r) => String(r.name)}
              initial={p.technologies.map((t) => ({
                id: t.id,
                label: t.name,
                attribute: t.usageType,
              }))}
              attribute={{ label: "Usage", options: USAGE_TYPE_OPTIONS, defaultValue: "core" }}
              onSave={(items: PickedItem[]) =>
                setTechs.mutateAsync({
                  technologies: items.map((i) => ({ technologyId: i.id, usageType: i.attribute })),
                })
              }
            />
            <RelationPicker
              open={picker === "evidence"}
              onOpenChange={(o) => !o && setPicker(null)}
              title="Project evidence"
              description="Select the evidence that documents this project."
              resource="evidence"
              path="/api/v1/evidence"
              optionLabel={(r) => String(r.title)}
              initial={p.evidence.map((e) => ({ id: e.id, label: e.title }))}
              onSave={(items) => setEvidence.mutateAsync({ evidenceIds: items.map((i) => i.id) })}
            />
          </>
        )}
      </DetailFrame>
    </MetricDefinitionProvider>
  );
}

// ── Skill ──────────────────────────────────────────────────────────────────

export function SkillDetail({ id }: { id: string }) {
  const path = `/api/v1/skills/${id}`;
  const { query, update, remove, invalidates } = useDetail<SkillDetailDto>("skills", path, [
    "projects",
    "evidence",
    "certifications",
  ]);
  const [picking, setPicking] = useState(false);
  const setEvidence = useApiMutation<{ evidence: { evidenceId: string; strength?: string }[] }>(
    "PUT",
    `${path}/evidence`,
    invalidates,
  );

  return (
    <DetailFrame query={query} backHref="/skills" backLabel="All skills">
      {(s) => (
        <>
          <DetailHeader
            title={s.name}
            subtitle={s.category ?? undefined}
            badges={
              <>
                <Badge>{s.active ? "Active" : "Inactive"}</Badge>
                <Badge>Target: {s.targetLevelLabel ?? "none"}</Badge>
                <OriginBadge origin={s.origin} />
              </>
            }
            actions={
              <EditDeleteActions
                label="skill"
                fields={SKILL_FIELDS}
                entity={s}
                onSave={(payload) => update.mutateAsync(payload)}
                onDelete={() => remove.mutateAsync()}
                afterDelete="/skills"
              />
            }
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Panel title="About">
                <FieldGrid
                  items={[
                    { label: "Description", value: s.description, wide: true },
                    {
                      label: "Current level",
                      value:
                        "Derived from evidence in Phase 4 (skills & career intelligence). Not self-assessed.",
                      wide: true,
                    },
                  ]}
                />
              </Panel>
              <RelationPanel
                title="Evidence"
                items={s.evidence.map((e) => ({
                  ...evidenceItem(e),
                  meta: <Badge>Strength: {labelOf(EVIDENCE_STRENGTH_OPTIONS, e.strength)}</Badge>,
                }))}
                emptyText="No evidence linked yet."
                onManage={() => setPicking(true)}
                manageLabel="Manage evidence"
              />
              <RelationPanel
                title="Projects"
                items={s.projects.map((p) => ({
                  id: p.id,
                  label: p.name,
                  href: `/projects/${p.id}`,
                  meta: <Badge>{labelOf(PROJECT_STATUS_OPTIONS, p.status)}</Badge>,
                }))}
                emptyText="No projects use this skill yet. Link it from a project."
              />
              <RelationPanel
                title="Certifications"
                items={s.certifications.map((c) => ({
                  id: c.id,
                  label: c.name,
                  href: `/certifications/${c.id}`,
                  meta: c.issuer,
                }))}
                emptyText="No certifications are related to this skill."
              />
            </div>
            <ProvenancePanel provenance={s.provenance} />
          </div>
          <RelationPicker
            open={picking}
            onOpenChange={setPicking}
            title="Skill evidence"
            description="Select evidence that demonstrates this skill, and how strongly."
            resource="evidence"
            path="/api/v1/evidence"
            optionLabel={(r) => String(r.title)}
            initial={s.evidence.map((e) => ({ id: e.id, label: e.title, attribute: e.strength }))}
            attribute={{
              label: "Strength",
              options: EVIDENCE_STRENGTH_OPTIONS,
              defaultValue: "moderate",
            }}
            onSave={(items) =>
              setEvidence.mutateAsync({
                evidence: items.map((i) => ({ evidenceId: i.id, strength: i.attribute })),
              })
            }
          />
        </>
      )}
    </DetailFrame>
  );
}

// ── Technology ─────────────────────────────────────────────────────────────

export function TechnologyDetail({ id }: { id: string }) {
  const path = `/api/v1/technologies/${id}`;
  const { query, update, remove } = useDetail<TechnologyDetailDto>("technologies", path, [
    "projects",
  ]);
  return (
    <DetailFrame query={query} backHref="/skills/technologies" backLabel="All technologies">
      {(t) => (
        <>
          <DetailHeader
            title={t.version ? `${t.name} ${t.version}` : t.name}
            subtitle={t.category ?? undefined}
            badges={<OriginBadge origin={t.origin} />}
            actions={
              <EditDeleteActions
                label="technology"
                fields={TECHNOLOGY_FIELDS}
                entity={t}
                onSave={(payload) => update.mutateAsync(payload)}
                onDelete={() => remove.mutateAsync()}
                afterDelete="/skills/technologies"
              />
            }
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Panel title="Notes">
                <FieldGrid items={[{ label: "Notes", value: t.notes, wide: true }]} />
              </Panel>
              <RelationPanel
                title="Projects"
                items={t.projects.map((p) => ({
                  id: p.id,
                  label: p.name,
                  href: `/projects/${p.id}`,
                  meta: <Badge>{labelOf(USAGE_TYPE_OPTIONS, p.usageType)}</Badge>,
                }))}
                emptyText="Not used in any project yet. Link it from a project."
              />
            </div>
            <ProvenancePanel provenance={t.provenance} />
          </div>
        </>
      )}
    </DetailFrame>
  );
}

// ── Certification ──────────────────────────────────────────────────────────

export function CertificationDetail({ id }: { id: string }) {
  const path = `/api/v1/certifications/${id}`;
  const { query, update, remove, invalidates } = useDetail<CertificationDetailDto>(
    "certifications",
    path,
    ["skills", "evidence"],
  );
  const [picker, setPicker] = useState<"skills" | "evidence" | null>(null);
  const setSkills = useApiMutation<{ skillIds: string[] }>("PUT", `${path}/skills`, invalidates);
  const setEvidence = useApiMutation<{ evidenceIds: string[] }>(
    "PUT",
    `${path}/evidence`,
    invalidates,
  );

  return (
    <DetailFrame query={query} backHref="/certifications" backLabel="All certifications">
      {(c) => (
        <>
          <DetailHeader
            title={c.name}
            subtitle={c.issuer}
            badges={
              <>
                <Badge>{labelOf(CERTIFICATION_STATUS_OPTIONS, c.status)}</Badge>
                <Badge>{labelOf(EXPIRY_OPTIONS, c.expiryState)}</Badge>
                <OriginBadge origin={c.origin} />
              </>
            }
            actions={
              <EditDeleteActions
                label="certification"
                fields={CERTIFICATION_FIELDS}
                entity={c}
                onSave={(payload) => update.mutateAsync(payload)}
                onDelete={() => remove.mutateAsync()}
                afterDelete="/certifications"
              />
            }
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Panel title="Credential">
                <FieldGrid
                  items={[
                    { label: "Category", value: c.category },
                    {
                      label: "Credential ID",
                      value: c.credentialId && <span className="font-mono">{c.credentialId}</span>,
                    },
                    { label: "Issued", value: formatDate(c.issueDate) },
                    { label: "Expires", value: formatDate(c.expiryDate) },
                    {
                      label: "Verification",
                      value: <ExternalLink href={c.verificationUrl} />,
                      wide: true,
                    },
                  ]}
                />
              </Panel>
              <RelationPanel
                title="Related skills"
                items={c.skills.map((s) => ({ id: s.id, label: s.name, href: `/skills/${s.id}` }))}
                emptyText="No related skills. A certification relates to skills; it does not prove production proficiency."
                onManage={() => setPicker("skills")}
                manageLabel="Manage related skills"
              />
              <RelationPanel
                title="Evidence"
                items={c.evidence.map(evidenceItem)}
                emptyText="No evidence linked yet."
                onManage={() => setPicker("evidence")}
                manageLabel="Manage evidence"
              />
            </div>
            <ProvenancePanel provenance={c.provenance} />
          </div>
          <RelationPicker
            open={picker === "skills"}
            onOpenChange={(o) => !o && setPicker(null)}
            title="Related skills"
            description="Skills this certification covers. This does not change any skill level."
            resource="skills"
            path="/api/v1/skills"
            optionLabel={(r) => String(r.name)}
            initial={c.skills.map((s) => ({ id: s.id, label: s.name }))}
            onSave={(items) => setSkills.mutateAsync({ skillIds: items.map((i) => i.id) })}
          />
          <RelationPicker
            open={picker === "evidence"}
            onOpenChange={(o) => !o && setPicker(null)}
            title="Certification evidence"
            description="For example the certificate document or the verification page."
            resource="evidence"
            path="/api/v1/evidence"
            optionLabel={(r) => String(r.title)}
            initial={c.evidence.map((e) => ({ id: e.id, label: e.title }))}
            onSave={(items) => setEvidence.mutateAsync({ evidenceIds: items.map((i) => i.id) })}
          />
        </>
      )}
    </DetailFrame>
  );
}

// ── Evidence ───────────────────────────────────────────────────────────────

export function EvidenceDetail({ id }: { id: string }) {
  const path = `/api/v1/evidence/${id}`;
  const { query, update, remove } = useDetail<EvidenceDetailDto>("evidence", path, [
    "projects",
    "skills",
    "certifications",
    "experiences",
  ]);
  return (
    <DetailFrame query={query} backHref="/evidence" backLabel="All evidence">
      {(e) => (
        <>
          <DetailHeader
            title={e.title}
            subtitle={formatDate(e.date) ?? undefined}
            badges={
              <>
                <Badge>{labelOf(EVIDENCE_TYPE_OPTIONS, e.type)}</Badge>
                {e.verified ? (
                  <Badge tone="success">
                    Verified {e.verifiedAt ? new Date(e.verifiedAt).toLocaleDateString() : ""}
                  </Badge>
                ) : (
                  <Badge>Unverified</Badge>
                )}
                <OriginBadge origin={e.origin} />
              </>
            }
            actions={
              <EditDeleteActions
                label="evidence item"
                fields={EVIDENCE_FIELDS}
                entity={e}
                onSave={(payload) => update.mutateAsync(payload)}
                onDelete={() => remove.mutateAsync()}
                afterDelete="/evidence"
              />
            }
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Panel title="Details">
                <FieldGrid
                  items={[
                    { label: "Description", value: e.description, wide: true },
                    { label: "Source", value: <ExternalLink href={e.sourceUrl} />, wide: true },
                    { label: "File", value: <ExternalLink href={e.fileUrl} />, wide: true },
                  ]}
                />
              </Panel>
              <RelationPanel
                title="Projects"
                items={e.projects.map((p) => ({
                  id: p.id,
                  label: p.name,
                  href: `/projects/${p.id}`,
                }))}
                emptyText="Not linked to any project."
              />
              <RelationPanel
                title="Skills"
                items={e.skills.map((s) => ({
                  id: s.id,
                  label: s.name,
                  href: `/skills/${s.id}`,
                  meta: <Badge>Strength: {labelOf(EVIDENCE_STRENGTH_OPTIONS, s.strength)}</Badge>,
                }))}
                emptyText="Not linked to any skill."
              />
              <RelationPanel
                title="Certifications"
                items={e.certifications.map((c) => ({
                  id: c.id,
                  label: c.name,
                  href: `/certifications/${c.id}`,
                  meta: c.issuer,
                }))}
                emptyText="Not linked to any certification."
              />
              <RelationPanel
                title="Experience"
                items={e.experiences.map((x) => ({
                  id: x.id,
                  label: `${x.title} · ${x.organization}`,
                  href: `/career/experience/${x.id}`,
                }))}
                emptyText="Not linked to any experience."
              />
            </div>
            <ProvenancePanel provenance={e.provenance} />
          </div>
        </>
      )}
    </DetailFrame>
  );
}

// ── Experience ─────────────────────────────────────────────────────────────

export function ExperienceDetail({ id }: { id: string }) {
  const path = `/api/v1/experiences/${id}`;
  const { query, update, remove, invalidates } = useDetail<ExperienceDetailDto>(
    "experiences",
    path,
    ["evidence"],
  );
  const [picking, setPicking] = useState(false);
  const setEvidence = useApiMutation<{ evidenceIds: string[] }>(
    "PUT",
    `${path}/evidence`,
    invalidates,
  );
  return (
    <DetailFrame query={query} backHref="/career/experience" backLabel="All experience">
      {(x) => (
        <>
          <DetailHeader
            title={x.title}
            subtitle={`${x.organization} · ${formatDate(x.startDate)} – ${x.current ? "present" : formatDate(x.endDate)}`}
            badges={<OriginBadge origin={x.origin} />}
            actions={
              <EditDeleteActions
                label="experience"
                fields={EXPERIENCE_FIELDS}
                entity={x}
                onSave={(payload) => update.mutateAsync(payload)}
                onDelete={() => remove.mutateAsync()}
                afterDelete="/career/experience"
              />
            }
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Panel title="Role">
                <FieldGrid items={[{ label: "Description", value: x.description, wide: true }]} />
                {x.achievements.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-caption text-muted-foreground">Achievements</h3>
                    <ul className="mt-1 list-disc pl-5">
                      {x.achievements.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>
              <RelationPanel
                title="Evidence"
                items={x.evidence.map(evidenceItem)}
                emptyText="No evidence linked yet."
                onManage={() => setPicking(true)}
                manageLabel="Manage evidence"
              />
            </div>
            <ProvenancePanel provenance={x.provenance} />
          </div>
          <RelationPicker
            open={picking}
            onOpenChange={setPicking}
            title="Experience evidence"
            description="Select evidence from this role."
            resource="evidence"
            path="/api/v1/evidence"
            optionLabel={(r) => String(r.title)}
            initial={x.evidence.map((e) => ({ id: e.id, label: e.title }))}
            onSave={(items) => setEvidence.mutateAsync({ evidenceIds: items.map((i) => i.id) })}
          />
        </>
      )}
    </DetailFrame>
  );
}
