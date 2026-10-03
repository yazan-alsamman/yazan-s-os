"use client";

import { CheckCircle2, Circle, Info } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";

import { useShowDefinition } from "@/components/command-center/metric-definition";
import { formatDate } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import {
  EVIDENCE_STRENGTH_OPTIONS,
  EVIDENCE_TYPE_OPTIONS,
  labelOf,
  PROJECT_STATUS_OPTIONS,
} from "@/components/records/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiGet, useApiMutation } from "@/lib/api/hooks";
import type { LevelModelDto } from "@/modules/skills/level-model.service";
import type { SkillLevelModel } from "@/modules/skills/level-models";
import type { SkillDossierDto } from "@/modules/skills/skill-intelligence.service";

export const FRESHNESS_LABEL: Record<string, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
  no_dated_evidence: "No dated evidence",
  no_evidence: "No evidence",
};
export const FRESHNESS_TONE = {
  fresh: "success",
  aging: "warning",
  stale: "danger",
  no_dated_evidence: "neutral",
  no_evidence: "neutral",
} as const;
export const GAP_LABEL: Record<string, string> = {
  below_target: "Below target",
  at_target: "At target",
  above_target: "Above target",
  not_computable: "Not computable",
  no_target: "No target",
};
export const TREND_LABEL: Record<string, string> = {
  increasing: "More demonstrations",
  stable: "As many demonstrations",
  decreasing: "Fewer demonstrations",
  insufficient_history: "Insufficient history",
};

export function useSkillDossier(skillId: string) {
  return useApiGet<{ data: SkillDossierDto }>(
    ["skills", "intelligence", skillId],
    `/api/v1/skills/${skillId}/intelligence`,
  );
}

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border bg-surface-sunken/40 p-2.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-h3 font-semibold">{value}</dd>
      {sub && <dd className="text-caption text-muted-foreground">{sub}</dd>}
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
  action,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-20 rounded-lg border bg-surface"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 id={`${id}-title`} className="text-h3 font-semibold">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Level model selector (ADR 0026): default or one of the caller's custom models. */
function LevelModelSelect({ skillId, current }: { skillId: string; current: string | null }) {
  const id = useId();
  const models = useApiGet<{ data: { default: SkillLevelModel; custom: LevelModelDto[] } }>(
    ["skill-level-models"],
    "/api/v1/skill-level-models",
  );
  const update = useApiMutation<{ levelModelId: string | null }>(
    "PATCH",
    `/api/v1/skills/${skillId}`,
    ["skills", "skill-level-models"],
  );
  if (!models.data) return null;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption text-muted-foreground">
        Level model (names only — the evidence rules are the same)
      </label>
      <NativeSelect
        id={id}
        value={current ?? ""}
        disabled={update.isPending}
        onChange={(e) => update.mutate({ levelModelId: e.target.value || null })}
      >
        <option value="">{models.data.data.default.name}</option>
        {models.data.data.custom.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </NativeSelect>
      <Link href="/skills/level-models" className="text-caption underline underline-offset-4">
        Manage level models
      </Link>
    </div>
  );
}

export function SkillIntelligence({
  skillId,
  levelModelId,
  onManageTechnologies,
  onManageEvidence,
  explicitTechnologies,
}: {
  skillId: string;
  levelModelId: string | null;
  onManageTechnologies: () => void;
  onManageEvidence: () => void;
  explicitTechnologies: ReactNode;
}) {
  const showDefinition = useShowDefinition();
  const query = useSkillDossier(skillId);
  if (query.isPending) return <ListSkeleton rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const d = query.data.data;
  const row = d.row;
  const levelText =
    row.current.level === null
      ? "Not enough evidence"
      : `${row.current.level} — ${row.current.label}`;
  const targetText =
    row.target.level === null || row.target.level < 1
      ? "Not configured"
      : `${row.target.level} — ${row.target.label}`;
  const gapText =
    d.gap.gap === null
      ? "Not computable"
      : d.gap.gap > 0
        ? `${d.gap.gap} level${d.gap.gap === 1 ? "" : "s"} below`
        : d.gap.gap === 0
          ? "At target"
          : `${-d.gap.gap} above`;

  return (
    <div className="flex flex-col gap-4">
      <Section
        id="intelligence"
        title="Skill intelligence"
        description={`Derived from linked records, never self-assessed · evaluated ${formatDate(d.evaluatedOn)} (UTC) · ${d.derived.model}, ${d.freshness.model}, ${d.gap.model}`}
        action={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="How the skill level is derived"
            onClick={() => showDefinition("skills.current_level")}
          >
            <Info aria-hidden />
          </Button>
        }
      >
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Fact
            label="Evidence-derived level"
            value={levelText}
            sub={
              row.current.state === "insufficient_evidence" ? "Linked records do not qualify" : null
            }
          />
          <Fact label="Target" value={targetText} />
          <Fact
            label="Gap"
            value={gapText}
            sub={
              d.gap.critical ? (
                <Badge tone="danger">Critical gap</Badge>
              ) : d.gap.targetWithoutEvidence ? (
                "Target without evidence"
              ) : null
            }
          />
          <Fact
            label="Freshness"
            value={
              <Badge tone={FRESHNESS_TONE[d.freshness.state]}>
                {FRESHNESS_LABEL[d.freshness.state]}
              </Badge>
            }
            sub={d.freshness.latest ? `Last demonstrated ${formatDate(d.freshness.latest)}` : null}
          />
          <Fact
            label="Demonstration trend"
            value={TREND_LABEL[d.trend.state]}
            sub={`${d.trend.recentWindow} vs ${d.trend.previousWindow} (12-month windows)`}
          />
        </dl>
        <ul className="mt-3 flex flex-col gap-1 text-body">
          <li>{d.derived.explanation}</li>
          <li>{d.gap.explanation}</li>
          <li>{d.freshness.explanation}</li>
          <li>{d.trend.explanation}</li>
        </ul>
        <div className="mt-3 max-w-xs">
          <LevelModelSelect skillId={skillId} current={levelModelId} />
        </div>
      </Section>

      <Section
        id="level-rules"
        title="How the level is derived"
        description="A level is reached only when its rule and every lower rule hold. Requirements show the counts found in your records."
      >
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Level rules (scrolls horizontally on small screens)"
          tabIndex={0}
        >
          <table className="w-full min-w-[36rem] text-body">
            <caption className="sr-only">Evidence rules per level, with the counts found</caption>
            <thead className="text-caption text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  Level
                </th>
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  Requirement
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Needed
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Found
                </th>
                <th scope="col" className="py-1 text-left font-medium">
                  Met
                </th>
              </tr>
            </thead>
            <tbody>
              {d.derived.rules.map((rule) =>
                rule.requirements.map((q, i) => (
                  <tr key={`${rule.level}-${i}`} className={i === 0 ? "border-t" : undefined}>
                    {i === 0 && (
                      <th
                        scope="row"
                        rowSpan={rule.requirements.length}
                        className="py-1.5 pr-3 text-left align-top font-medium"
                      >
                        {rule.level} —{" "}
                        {d.levelModel.levels.find((l) => l.value === rule.level)?.label}
                        <span className="block text-caption font-normal text-muted-foreground">
                          {rule.mode === "any" ? "any one of" : "all of"} ·{" "}
                          {rule.met ? "rule holds" : "rule not met"}
                        </span>
                      </th>
                    )}
                    <td className="py-1.5 pr-3">{q.label}</td>
                    <td className="py-1.5 pr-3 text-right tabular">≥ {q.required}</td>
                    <td className="py-1.5 pr-3 text-right tabular">{q.actual}</td>
                    <td className="py-1.5">
                      {q.met ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 aria-hidden className="size-4" /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Circle aria-hidden className="size-4" /> No
                        </span>
                      )}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        {d.derived.nextLevel && d.derived.nextLevel.missing.length > 0 && (
          <p className="mt-2 text-body">
            <strong>To reach level {d.derived.nextLevel.level}:</strong>{" "}
            {d.derived.nextLevel.missing
              .map((m) => `${m.label} (${m.actual} of ${m.required})`)
              .join("; ")}
            .
          </p>
        )}
      </Section>

      <Section
        id="skill-evidence"
        title={`Supporting evidence (${d.evidence.total})`}
        description="Demonstration date = the link date, or else the evidence date. Undated evidence counts as evidence but not for recency; future dates are ignored."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={onManageEvidence}
            aria-label="Manage evidence"
          >
            Manage
          </Button>
        }
      >
        {d.evidence.items.length === 0 ? (
          <p className="text-muted-foreground">
            No evidence is linked. Link evidence to derive a level beyond what projects or
            certifications support.
          </p>
        ) : (
          <ol className="divide-y" aria-label="Skill evidence, newest demonstration first">
            {d.evidence.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="w-28 text-caption text-muted-foreground tabular">
                  {e.demonstratedOn ? formatDate(e.demonstratedOn) : "Undated"}
                  {e.future && " (future)"}
                </span>
                <Link
                  href={`/evidence/${e.id}` as never}
                  className="min-w-0 basis-full font-medium hover:underline sm:flex-1 sm:basis-auto"
                >
                  {e.title}
                </Link>
                <Badge>{labelOf(EVIDENCE_TYPE_OPTIONS, e.type)}</Badge>
                <Badge>Strength: {labelOf(EVIDENCE_STRENGTH_OPTIONS, e.strength)}</Badge>
                {e.verified ? <Badge tone="success">Verified</Badge> : <Badge>Unverified</Badge>}
                {e.origin === "import" && <Badge tone="info">Imported</Badge>}
              </li>
            ))}
          </ol>
        )}
        {d.evidence.total > d.evidence.shown && (
          <p className="mt-2 text-caption text-muted-foreground">
            Showing {d.evidence.shown} of {d.evidence.total}.{" "}
            <Link
              href={`/evidence?skillId=${skillId}` as never}
              className="underline underline-offset-4"
            >
              View all
            </Link>
          </p>
        )}
        <h3 className="mt-4 text-body font-semibold">Dated demonstrations per year</h3>
        <table className="mt-1 w-full max-w-md text-body">
          <caption className="sr-only">Dated demonstrations per calendar year</caption>
          <thead className="text-caption text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 text-left font-medium">
                Year
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Demonstrations
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Strong
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {d.yearly.map((y) => (
              <tr key={y.year}>
                <th scope="row" className="py-1 text-left font-normal tabular">
                  {y.year}
                </th>
                <td className="py-1 text-right tabular">{y.count}</td>
                <td className="py-1 text-right tabular">{y.strong}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-caption text-muted-foreground">
          Counts of real dated demonstrations only — no level history is reconstructed.
        </p>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          id="skill-projects"
          title={`Projects (${d.projects.length})`}
          description="Projects linked to this skill. Projects in production count as production-linked records."
        >
          {d.projects.length === 0 ? (
            <p className="text-muted-foreground">
              No project is linked. Link this skill from a project.
            </p>
          ) : (
            <ul className="divide-y">
              {d.projects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <Link href={`/projects/${p.id}` as never} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <Badge>{labelOf(PROJECT_STATUS_OPTIONS, p.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section
          id="skill-technologies"
          title="Technologies"
          description="Explicit links you maintain, and technologies used in this skill's projects (a real project path, shown separately)."
          action={
            <Button variant="outline" size="sm" onClick={onManageTechnologies}>
              Manage technologies
            </Button>
          }
        >
          {explicitTechnologies}
          <h3 className="mt-3 text-body font-semibold">Used in this skill&apos;s projects</h3>
          {d.technologies.viaProjects.length === 0 ? (
            <p className="text-muted-foreground">None.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1">
              {d.technologies.viaProjects.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/skills/technologies/${t.id}` as never}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption hover:bg-accent"
                  >
                    {t.name}
                    <span className="text-muted-foreground tabular">{t.projects}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section
          id="skill-certifications"
          title={`Certifications (${d.certifications.length})`}
          description="Certifications cap the derived level at Working knowledge (2): they are not proof of production proficiency."
        >
          {d.certifications.length === 0 ? (
            <p className="text-muted-foreground">No certification is linked.</p>
          ) : (
            <ul className="divide-y">
              {d.certifications.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <Link
                    href={`/certifications/${c.id}` as never}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span className="flex flex-wrap gap-1">
                    <Badge>{c.issuer}</Badge>
                    <Badge tone={c.status === "earned" ? "success" : "neutral"}>
                      {c.status.replace("_", " ")}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section
          id="skill-experiences"
          title={`Experiences (${d.experiences.length})`}
          description="Experiences whose linked evidence demonstrates this skill."
        >
          {d.experiences.length === 0 ? (
            <p className="text-muted-foreground">
              No experience has evidence linked to this skill.
            </p>
          ) : (
            <ul className="divide-y">
              {d.experiences.map((x) => (
                <li key={x.id} className="py-1.5">
                  <Link
                    href={`/career/experience/${x.id}` as never}
                    className="font-medium hover:underline"
                  >
                    {x.title} · {x.organization}
                  </Link>
                  <span className="block text-caption text-muted-foreground">
                    {formatDate(x.startDate)} – {x.endDate ? formatDate(x.endDate) : "present"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <p className="text-caption text-muted-foreground">
        Explore connections in the{" "}
        <Link
          href={`/skills/graph?focusType=skill&focusId=${skillId}` as never}
          className="underline underline-offset-4"
        >
          career graph
        </Link>
        .
      </p>
    </div>
  );
}
