import type { Project } from "@/generated/prisma/client";
import { toDateOnly } from "@/modules/shared/fields";
import { toProvenance } from "@/modules/shared/provenance";

import type { ProjectDetailRecord } from "./project.repository";

/** Public project shape (no owner id, dates as YYYY-MM-DD). */
export function toProjectDto(project: Project) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    problem: project.problem,
    solution: project.solution,
    impact: project.impact,
    status: project.status,
    healthStatus: project.healthStatus,
    startDate: toDateOnly(project.startDate),
    targetDate: toDateOnly(project.targetDate),
    completedAt: toDateOnly(project.completedAt),
    repositoryUrl: project.repositoryUrl,
    demoUrl: project.demoUrl,
    productionUrl: project.productionUrl,
    origin: project.origin,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export type ProjectDto = ReturnType<typeof toProjectDto>;

export function toProjectListItem(
  project: Project & { _count: { skills: number; technologies: number; evidence: number } },
) {
  return { ...toProjectDto(project), counts: project._count };
}

export type ProjectListItem = ReturnType<typeof toProjectListItem>;

export function toProjectDetailDto(project: ProjectDetailRecord) {
  return {
    ...toProjectDto(project),
    provenance: toProvenance(project),
    skills: project.skills.map((link) => link.skill),
    technologies: project.technologies.map((link) => ({
      ...link.technology,
      usageType: link.usageType,
      proficiencyEvidence: link.proficiencyEvidence,
    })),
    evidence: project.evidence.map((link) => ({
      ...link.evidence,
      date: toDateOnly(link.evidence.date),
    })),
  };
}

export type ProjectDetailDto = ReturnType<typeof toProjectDetailDto>;

/** Audit snapshot: domain fields only. */
export function projectSnapshot(project: Project) {
  return toProjectDto(project);
}
