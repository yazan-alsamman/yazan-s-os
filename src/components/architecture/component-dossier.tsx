"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { ConfirmDelete } from "@/components/data/confirm-delete";
import {
  BackLink,
  DetailHeader,
  DetailSkeleton,
  FieldGrid,
  formatDate,
} from "@/components/data/detail";
import { RelationPicker } from "@/components/data/relation-picker";
import { ErrorState } from "@/components/data/states";
import { EntityFormDialog } from "@/components/forms/entity-form";
import { labelOf, PROJECT_STATUS_OPTIONS } from "@/components/records/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiGet, useApiMutation } from "@/lib/api/hooks";
import { ApiError } from "@/lib/http/fetch-json";
import type { ComponentDossierDto } from "@/modules/architecture/architecture-intelligence";

import { DecisionStatusBadge } from "./architecture-lists";
import { COMPONENT_FIELDS, COMPONENT_TYPE_LABEL } from "./options";

const INVALIDATES = ["architecture", "analytics", "projects", "technologies", "search"];

function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-t`}
      className="scroll-mt-20 rounded-lg border bg-surface"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id={`${id}-t`} className="text-h3 font-semibold">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

type Node = ComponentDossierDto["dependsOn"][number];

function NodeList({ items, empty }: { items: Node[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {items.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
          <Link
            href={`/architecture/components/${c.id}` as never}
            className="font-medium hover:underline"
          >
            {c.name}
          </Link>
          <span className="flex flex-wrap gap-1">
            <Badge>{COMPONENT_TYPE_LABEL[c.type]}</Badge>
            {c.critical && <Badge tone="danger">Critical</Badge>}
          </span>
        </li>
      ))}
    </ul>
  );
}

type Picker = "projects" | "technologies" | "dependencies" | null;

function Body({ d }: { d: ComponentDossierDto }) {
  const router = useRouter();
  const c = d.component;
  const path = `/api/v1/architecture/components/${c.id}`;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const update = useApiMutation<Record<string, unknown>>("PATCH", path, INVALIDATES);
  const remove = useApiMutation<void>("DELETE", path, INVALIDATES);
  const setProjects = useApiMutation<{ projectIds: string[] }>(
    "PUT",
    `${path}/projects`,
    INVALIDATES,
  );
  const setTechs = useApiMutation<{ technologyIds: string[] }>(
    "PUT",
    `${path}/technologies`,
    INVALIDATES,
  );
  const setDeps = useApiMutation<{ componentIds: string[] }>(
    "PUT",
    `${path}/dependencies`,
    INVALIDATES,
  );
  const manage = (kind: Exclude<Picker, null>, label: string) => (
    <Button variant="outline" size="sm" onClick={() => setPicker(kind)} aria-label={label}>
      Manage
    </Button>
  );

  return (
    <>
      <DetailHeader
        title={c.name}
        subtitle={COMPONENT_TYPE_LABEL[c.type]}
        badges={
          c.critical ? <Badge tone="danger">Critical</Badge> : <Badge>Not marked critical</Badge>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden />
              Delete
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Section id="purpose" title="Purpose">
          <FieldGrid items={[{ label: "Purpose", value: c.purpose, wide: true }]} />
          <p className="mt-2 text-caption text-muted-foreground">
            Criticality is your own flag; it is never inferred from dependencies.
          </p>
        </Section>

        <Section
          id="decisions"
          title={`Decisions (${d.decisions.length})`}
          description="Architecture decisions that govern this component (linked from each decision)."
        >
          {d.decisions.length === 0 ? (
            <p className="text-muted-foreground">No decision governs this component yet.</p>
          ) : (
            <ul className="divide-y">
              {d.decisions.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <Link
                    href={`/architecture/${x.id}` as never}
                    className="font-medium hover:underline"
                  >
                    {x.title}
                  </Link>
                  <span className="flex flex-wrap items-center gap-1">
                    <DecisionStatusBadge status={x.status} />
                    {x.decidedAt && (
                      <span className="text-caption text-muted-foreground tabular">
                        {formatDate(x.decidedAt)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            id="depends-on"
            title={`Depends on (${d.dependsOn.length})`}
            description="Recorded dependencies only — never inferred."
            action={manage("dependencies", "Manage dependencies")}
          >
            <NodeList items={d.dependsOn} empty="No recorded dependencies." />
          </Section>
          <Section
            id="dependents"
            title={`Used by (${d.dependents.length})`}
            description="Components that depend on this one."
          >
            <NodeList items={d.dependents} empty="No component depends on this one." />
          </Section>
          <Section
            id="projects"
            title={`Projects (${d.projects.length})`}
            action={manage("projects", "Manage projects")}
          >
            {d.projects.length === 0 ? (
              <p className="text-muted-foreground">Not linked to a project.</p>
            ) : (
              <ul className="divide-y">
                {d.projects.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                  >
                    <Link
                      href={`/projects/${p.id}` as never}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    <Badge>{labelOf(PROJECT_STATUS_OPTIONS, p.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section
            id="technologies"
            title={`Technologies (${d.technologies.length})`}
            description="Existing Technology records — no separate registry."
            action={manage("technologies", "Manage technologies")}
          >
            {d.technologies.length === 0 ? (
              <p className="text-muted-foreground">No technology linked (unknown).</p>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {d.technologies.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/skills/technologies/${t.id}` as never}
                      className="inline-flex rounded-md border px-2 py-0.5 text-caption hover:bg-accent"
                    >
                      {t.version ? `${t.name} ${t.version}` : t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <p className="text-caption text-muted-foreground">
          See it in context on the{" "}
          <Link href="/architecture/map" className="underline underline-offset-4">
            architecture map
          </Link>
          . Incidents are not recorded in PEOS yet.
        </p>
      </div>

      <EntityFormDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit component"
        fields={COMPONENT_FIELDS}
        initial={c}
        submitLabel="Save changes"
        onSubmit={(payload) => update.mutateAsync(payload)}
      />
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete component?"
        description={`“${c.name}” and its links (decisions, projects, technologies, dependencies) will be removed. The linked records themselves are kept.`}
        onConfirm={async () => {
          await remove.mutateAsync();
          router.replace("/architecture/components");
        }}
      />
      <RelationPicker
        open={picker === "projects"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Component projects"
        description="Select the projects that use this component."
        resource="projects"
        path="/api/v1/projects"
        optionLabel={(r) => String(r.name)}
        initial={d.projects.map((p) => ({ id: p.id, label: p.name }))}
        onSave={(items) => setProjects.mutateAsync({ projectIds: items.map((i) => i.id) })}
      />
      <RelationPicker
        open={picker === "technologies"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Component technologies"
        description="Select the technologies this component is built with."
        resource="technologies"
        path="/api/v1/technologies"
        optionLabel={(r) => String(r.name)}
        initial={d.technologies.map((t) => ({ id: t.id, label: t.name }))}
        onSave={(items) => setTechs.mutateAsync({ technologyIds: items.map((i) => i.id) })}
      />
      <RelationPicker
        open={picker === "dependencies"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Dependencies"
        description="Select the components this one depends on."
        resource="architecture"
        path="/api/v1/architecture/components"
        optionLabel={(r) => String(r.name)}
        exclude={[c.id]}
        initial={d.dependsOn.map((x) => ({ id: x.id, label: x.name }))}
        onSave={(items) => setDeps.mutateAsync({ componentIds: items.map((i) => i.id) })}
      />
    </>
  );
}

export function ComponentDossier({ id }: { id: string }) {
  const query = useApiGet<{ data: ComponentDossierDto }>(
    ["architecture", "component", id],
    `/api/v1/architecture/components/${id}/intelligence`,
  );
  return (
    <div>
      <BackLink href="/architecture/components" label="All components" />
      {query.isPending ? (
        <DetailSkeleton />
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.status === 404 ? (
          <div role="alert" className="rounded-lg border bg-surface p-6">
            <h1 className="text-h2 font-semibold">Component not found</h1>
            <p className="mt-1 text-muted-foreground">
              This component does not exist or was deleted.
            </p>
          </div>
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )
      ) : (
        <Body d={query.data.data} />
      )}
    </div>
  );
}
