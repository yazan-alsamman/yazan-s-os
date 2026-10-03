"use client";

import { formatDate } from "@/components/data/detail";
import { ResourceList } from "@/components/data/resource-list";
import { Badge } from "@/components/ui/badge";
import type { CertificationListItem } from "@/modules/certifications/certification.repository";
import type { EducationDto } from "@/modules/education/education.service";
import type { EvidenceListItem } from "@/modules/evidence/evidence.repository";
import type { ExperienceListItem } from "@/modules/experiences/experience.repository";
import type { ProjectListItem } from "@/modules/projects/project.dto";
import type { SkillListItem } from "@/modules/skills/skill.repository";
import type { TechnologyListItem } from "@/modules/technologies/technology.repository";

import {
  CERTIFICATION_FIELDS,
  EDUCATION_FIELDS,
  EVIDENCE_FIELDS,
  EXPERIENCE_FIELDS,
  PROJECT_FIELDS,
  SKILL_FIELDS,
  TECHNOLOGY_FIELDS,
} from "./fields";
import {
  CERTIFICATION_STATUS_OPTIONS,
  EVIDENCE_TYPE_OPTIONS,
  EXPIRY_OPTIONS,
  labelOf,
  ORIGIN_OPTIONS,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  YES_NO_OPTIONS,
} from "./options";

const HEALTH_TONE = {
  on_track: "success",
  at_risk: "warning",
  blocked: "danger",
  not_assessed: "neutral",
} as const;
const EXPIRY_TONE = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  no_expiry: "neutral",
} as const;

const yesNo = (value: string) => (value === "true" ? "yes" : "no");

function OriginBadge({ origin }: { origin: string }) {
  return origin === "import" ? <Badge tone="info">Imported</Badge> : null;
}

export function ProjectsList() {
  return (
    <ResourceList<ProjectListItem>
      resource="projects"
      path="/api/v1/projects"
      singular="project"
      plural="projects"
      related={["skills", "technologies", "evidence"]}
      rowLabel={(p) => p.name}
      detailHref={(p) => `/projects/${p.id}`}
      extraParams={[
        {
          name: "lifecycle",
          label: "Lifecycle",
          format: (v) => (v === "active" ? "active work" : "production systems"),
        },
        { name: "completedFrom", label: "Completed from" },
        { name: "completedTo", label: "Completed to" },
        { name: "technologyId", label: "Uses technology", format: () => "selected technology" },
        { name: "skillId", label: "Demonstrates skill", format: () => "selected skill" },
        { name: "hasEvidence", label: "Has evidence", format: yesNo },
      ]}
      searchPlaceholder="Name, description, problem, impact…"
      filters={[
        { name: "status", label: "Status", options: PROJECT_STATUS_OPTIONS },
        { name: "healthStatus", label: "Manual health", options: PROJECT_HEALTH_OPTIONS },
      ]}
      sortOptions={[
        { value: "-updatedAt", label: "Recently updated" },
        { value: "name", label: "Name A–Z" },
        { value: "-startDate", label: "Newest start" },
        { value: "status", label: "Status" },
      ]}
      defaultSort="-updatedAt"
      fields={PROJECT_FIELDS}
      empty={{
        title: "No projects yet.",
        body: "Add a project manually or import your existing records from Settings → Import. PEOS never shows sample data.",
      }}
      columns={[
        { header: "Project", cell: (p) => p.name },
        { header: "Status", cell: (p) => labelOf(PROJECT_STATUS_OPTIONS, p.status) },
        {
          header: "Manual health",
          cell: (p) => (
            <Badge tone={HEALTH_TONE[p.healthStatus]}>
              {labelOf(PROJECT_HEALTH_OPTIONS, p.healthStatus)}
            </Badge>
          ),
        },
        { header: "Started", cell: (p) => formatDate(p.startDate) ?? "—", className: "tabular" },
        {
          header: "Links",
          cell: (p) => (
            <span className="text-caption text-muted-foreground tabular">
              {p.counts.skills} skills · {p.counts.technologies} tech · {p.counts.evidence} evidence
            </span>
          ),
        },
        { header: "Origin", cell: (p) => <OriginBadge origin={p.origin} /> },
      ]}
    />
  );
}

export function SkillsList() {
  return (
    <ResourceList<SkillListItem>
      resource="skills"
      path="/api/v1/skills"
      singular="skill"
      plural="skills"
      related={["projects", "certifications", "evidence"]}
      rowLabel={(s) => s.name}
      detailHref={(s) => `/skills/${s.id}`}
      extraParams={[
        { name: "category", label: "Category" },
        { name: "hasEvidence", label: "Has evidence", format: yesNo },
      ]}
      searchPlaceholder="Name, category, description…"
      filters={[
        { name: "active", label: "Active", options: YES_NO_OPTIONS },
        { name: "hasTarget", label: "Has target", options: YES_NO_OPTIONS },
      ]}
      sortOptions={[
        { value: "name", label: "Name A–Z" },
        { value: "category", label: "Category" },
        { value: "-targetLevel", label: "Highest target" },
        { value: "-updatedAt", label: "Recently updated" },
      ]}
      defaultSort="name"
      fields={SKILL_FIELDS}
      empty={{
        title: "No skills yet.",
        body: "Add the skills you want to track. Skill levels are later derived from linked evidence, not self-assessment.",
      }}
      columns={[
        { header: "Skill", cell: (s) => s.name },
        { header: "Category", cell: (s) => s.category ?? "—" },
        { header: "Target", cell: (s) => s.targetLevelLabel ?? "—" },
        { header: "Active", cell: (s) => (s.active ? "Yes" : "No") },
        {
          header: "Links",
          cell: (s) => (
            <span className="text-caption text-muted-foreground tabular">
              {s.counts.projects} projects · {s.counts.evidence} evidence ·{" "}
              {s.counts.certifications} certs
            </span>
          ),
        },
        { header: "Origin", cell: (s) => <OriginBadge origin={s.origin} /> },
      ]}
    />
  );
}

export function TechnologiesList() {
  return (
    <ResourceList<TechnologyListItem>
      resource="technologies"
      path="/api/v1/technologies"
      singular="technology"
      plural="technologies"
      related={["projects"]}
      rowLabel={(t) => t.name}
      detailHref={(t) => `/skills/technologies/${t.id}`}
      searchPlaceholder="Name, category, version, notes…"
      sortOptions={[
        { value: "name", label: "Name A–Z" },
        { value: "category", label: "Category" },
        { value: "-updatedAt", label: "Recently updated" },
      ]}
      defaultSort="name"
      fields={TECHNOLOGY_FIELDS}
      empty={{
        title: "No technologies yet.",
        body: "Add technologies, then link them to projects with a usage type.",
      }}
      columns={[
        { header: "Technology", cell: (t) => t.name },
        { header: "Category", cell: (t) => t.category ?? "—" },
        { header: "Version", cell: (t) => t.version ?? "—" },
        { header: "Projects", cell: (t) => <span className="tabular">{t.counts.projects}</span> },
        { header: "Origin", cell: (t) => <OriginBadge origin={t.origin} /> },
      ]}
    />
  );
}

export function CertificationsList() {
  return (
    <ResourceList<CertificationListItem>
      resource="certifications"
      path="/api/v1/certifications"
      singular="certification"
      plural="certifications"
      related={["skills", "evidence"]}
      rowLabel={(c) => c.name}
      detailHref={(c) => `/certifications/${c.id}`}
      extraParams={[{ name: "current", label: "Excluding revoked", format: yesNo }]}
      searchPlaceholder="Name, issuer, category, credential ID…"
      filters={[
        { name: "status", label: "Status", options: CERTIFICATION_STATUS_OPTIONS },
        { name: "expiry", label: "Expiry", options: EXPIRY_OPTIONS },
      ]}
      sortOptions={[
        { value: "-issueDate", label: "Newest issued" },
        { value: "expiryDate", label: "Expiring first" },
        { value: "name", label: "Name A–Z" },
        { value: "issuer", label: "Issuer" },
      ]}
      defaultSort="-issueDate"
      fields={CERTIFICATION_FIELDS}
      empty={{
        title: "No certifications yet.",
        body: "Certifications contribute evidence; they never automatically prove production proficiency.",
      }}
      columns={[
        { header: "Certification", cell: (c) => c.name },
        { header: "Issuer", cell: (c) => c.issuer },
        { header: "Status", cell: (c) => labelOf(CERTIFICATION_STATUS_OPTIONS, c.status) },
        { header: "Issued", cell: (c) => formatDate(c.issueDate) ?? "—", className: "tabular" },
        {
          header: "Expiry",
          cell: (c) => (
            <Badge tone={EXPIRY_TONE[c.expiryState]}>
              {labelOf(EXPIRY_OPTIONS, c.expiryState)}
              {c.expiryDate ? ` · ${formatDate(c.expiryDate)}` : ""}
            </Badge>
          ),
        },
      ]}
    />
  );
}

export function EvidenceList() {
  return (
    <ResourceList<EvidenceListItem>
      resource="evidence"
      path="/api/v1/evidence"
      singular="evidence item"
      plural="evidence items"
      related={["projects", "skills", "certifications", "experiences"]}
      rowLabel={(e) => e.title}
      detailHref={(e) => `/evidence/${e.id}`}
      extraParams={[
        { name: "dateFrom", label: "Dated from" },
        { name: "dateTo", label: "Dated to" },
        { name: "dated", label: "Has a date", format: yesNo },
        { name: "projectId", label: "Linked to project", format: () => "this project" },
        { name: "skillId", label: "Linked to skill", format: () => "this skill" },
      ]}
      searchPlaceholder="Title, description, source URL…"
      filters={[
        { name: "type", label: "Type", options: EVIDENCE_TYPE_OPTIONS },
        { name: "verified", label: "Verified", options: YES_NO_OPTIONS },
        { name: "origin", label: "Provenance", options: ORIGIN_OPTIONS },
      ]}
      sortOptions={[
        { value: "-date", label: "Newest" },
        { value: "title", label: "Title A–Z" },
        { value: "type", label: "Type" },
        { value: "-updatedAt", label: "Recently updated" },
      ]}
      defaultSort="-date"
      fields={EVIDENCE_FIELDS}
      empty={{
        title: "No evidence yet.",
        body: "Evidence is what makes skills and projects credible: repositories, documents, demos, metrics, certificates.",
      }}
      columns={[
        { header: "Evidence", cell: (e) => e.title },
        { header: "Type", cell: (e) => labelOf(EVIDENCE_TYPE_OPTIONS, e.type) },
        { header: "Date", cell: (e) => formatDate(e.date) ?? "—", className: "tabular" },
        {
          header: "Verified",
          cell: (e) =>
            e.verified ? <Badge tone="success">Verified</Badge> : <Badge>Unverified</Badge>,
        },
        {
          header: "Linked to",
          cell: (e) => (
            <span className="text-caption text-muted-foreground tabular">
              {e.counts.projects + e.counts.skills + e.counts.certifications + e.counts.experiences}{" "}
              records
            </span>
          ),
        },
        { header: "Origin", cell: (e) => <OriginBadge origin={e.origin} /> },
      ]}
    />
  );
}

export function ExperiencesList() {
  return (
    <ResourceList<ExperienceListItem>
      resource="experiences"
      path="/api/v1/experiences"
      singular="experience"
      plural="experiences"
      related={["evidence"]}
      rowLabel={(e) => `${e.title} at ${e.organization}`}
      detailHref={(e) => `/career/experience/${e.id}`}
      searchPlaceholder="Title, organization, description…"
      filters={[{ name: "current", label: "Current", options: YES_NO_OPTIONS }]}
      sortOptions={[
        { value: "-startDate", label: "Most recent" },
        { value: "organization", label: "Organization" },
        { value: "title", label: "Title" },
      ]}
      defaultSort="-startDate"
      fields={EXPERIENCE_FIELDS}
      empty={{
        title: "No experience yet.",
        body: "Add positions manually or import your LinkedIn Positions.csv from Settings → Import.",
      }}
      columns={[
        { header: "Title", cell: (e) => e.title },
        { header: "Organization", cell: (e) => e.organization },
        {
          header: "Period",
          cell: (e) =>
            `${formatDate(e.startDate)} – ${e.current ? "present" : formatDate(e.endDate)}`,
          className: "tabular",
        },
        { header: "Evidence", cell: (e) => <span className="tabular">{e.counts.evidence}</span> },
        { header: "Origin", cell: (e) => <OriginBadge origin={e.origin} /> },
      ]}
    />
  );
}

export function EducationList() {
  return (
    <ResourceList<EducationDto>
      resource="education"
      path="/api/v1/education"
      singular="education entry"
      plural="education entries"
      rowLabel={(e) => e.institution}
      searchPlaceholder="Institution, degree, field of study…"
      sortOptions={[
        { value: "-startDate", label: "Most recent" },
        { value: "institution", label: "Institution" },
      ]}
      defaultSort="-startDate"
      fields={EDUCATION_FIELDS}
      empty={{ title: "No education yet.", body: "Add degrees, programmes and courses of study." }}
      columns={[
        { header: "Institution", cell: (e) => e.institution },
        { header: "Degree", cell: (e) => e.degree ?? "—" },
        { header: "Field", cell: (e) => e.fieldOfStudy ?? "—" },
        {
          header: "Period",
          cell: (e) =>
            e.startDate || e.endDate
              ? `${formatDate(e.startDate) ?? "?"} – ${formatDate(e.endDate) ?? "?"}`
              : "—",
          className: "tabular",
        },
        {
          header: "Origin",
          cell: (e) => (e.origin === "import" ? <Badge tone="info">Imported</Badge> : null),
        },
      ]}
    />
  );
}
