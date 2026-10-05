import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { toDateOnly } from "@/modules/shared/fields";

/**
 * Grounded project retrospective (Phase 13, ADR 0060). Built entirely from the owner's real project
 * records (milestones, technologies, skills, linked evidence, architecture decisions). Every line is
 * labelled `observed` (from records), `inferred` (a pattern derived from records, clearly marked) or
 * `recommended` (a suggested next step). It never fabricates project history or outcomes, and it
 * states explicitly what cannot be determined from available data. Generated on demand — not stored,
 * so it can never masquerade as stale "current" project state.
 */

type Line = { kind: "observed" | "inferred" | "recommended"; text: string; refs?: string[] };

export async function generateRetrospective(
  db: PrismaClient,
  userId: string,
  projectId: string,
  now: Date,
) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    include: {
      milestones: { orderBy: { dueDate: "asc" } },
      technologies: { include: { technology: { select: { id: true, name: true } } } },
      skills: { include: { skill: { select: { id: true, name: true } } } },
      evidence: {
        include: {
          evidence: { select: { id: true, title: true, type: true, verified: true, date: true } },
        },
      },
      architectureDecisions: {
        include: {
          decision: { select: { id: true, title: true, status: true, decidedAt: true } },
        },
      },
    },
  });
  if (!project) throw new AppError("NOT_FOUND");

  const milestones = project.milestones;
  const completed = milestones.filter((m) => m.status === "completed");
  const overdue = milestones.filter(
    (m) => m.status !== "completed" && m.dueDate && m.dueDate < now,
  );
  const decisions = project.architectureDecisions.map((d) => d.decision);
  const evidence = project.evidence.map((e) => e.evidence);
  const verifiedEvidence = evidence.filter((e) => e.verified);

  const overview: Line[] = [
    {
      kind: "observed",
      text: `Project “${project.name}” — status ${project.status}, manual health ${project.healthStatus}.`,
      refs: [`project:${project.id}`],
    },
    {
      kind: "observed",
      text: `Started ${toDateOnly(project.startDate) ?? "unknown"}${project.completedAt ? `, completed ${toDateOnly(project.completedAt)}` : ", not marked complete"}.`,
    },
  ];

  const delivery: Line[] = [
    {
      kind: "observed",
      text: `${completed.length}/${milestones.length} milestones completed.`,
      refs: milestones.map((m) => `milestone:${m.id}`),
    },
    ...completed.slice(0, 10).map((m): Line => ({
      kind: "observed",
      text: `Completed: ${m.title}${m.completedAt ? ` (${toDateOnly(m.completedAt)})` : ""}.`,
      refs: [`milestone:${m.id}`],
    })),
  ];

  const engineering: Line[] = [
    {
      kind: "observed",
      text: `${project.technologies.length} technologies and ${project.skills.length} skills linked.`,
    },
    ...(project.technologies.length > 0
      ? [
          {
            kind: "observed" as const,
            text: `Technologies: ${project.technologies
              .map((t) => t.technology.name)
              .slice(0, 15)
              .join(", ")}.`,
          },
        ]
      : []),
  ];

  const architecture: Line[] =
    decisions.length > 0
      ? decisions.slice(0, 15).map((d): Line => ({
          kind: "observed",
          text: `Decision: ${d.title} (${d.status}).`,
          refs: [`decision:${d.id}`],
        }))
      : [{ kind: "observed", text: "No architecture decisions are linked to this project." }];

  const evidenceLines: Line[] =
    evidence.length > 0
      ? [
          {
            kind: "observed",
            text: `${evidence.length} evidence item(s) linked, ${verifiedEvidence.length} verified.`,
            refs: evidence.map((e) => `evidence:${e.id}`),
          },
          ...evidence.slice(0, 10).map((e): Line => ({
            kind: "observed",
            text: `${e.verified ? "✓" : "○"} ${e.title} (${e.type}).`,
            refs: [`evidence:${e.id}`],
          })),
        ]
      : [{ kind: "observed", text: "No evidence is linked to this project yet." }];

  const risks: Line[] = [];
  if (overdue.length > 0)
    risks.push({
      kind: "observed",
      text: `${overdue.length} milestone(s) are past their due date and not completed.`,
      refs: overdue.map((m) => `milestone:${m.id}`),
    });
  if (project.healthStatus === "at_risk" || project.healthStatus === "blocked")
    risks.push({ kind: "observed", text: `Manual health is “${project.healthStatus}”.` });
  if (verifiedEvidence.length === 0)
    risks.push({
      kind: "inferred",
      text: "No verified evidence is linked — delivery claims would currently be unsupported.",
    });
  if (risks.length === 0)
    risks.push({
      kind: "observed",
      text: "No overdue milestones or negative health signals recorded.",
    });

  const lessons: Line[] = [];
  if (milestones.length > 0 && completed.length === milestones.length)
    lessons.push({
      kind: "inferred",
      text: "All recorded milestones were completed — scope as planned was delivered.",
    });
  if (evidence.length > 0 && verifiedEvidence.length / evidence.length < 0.5)
    lessons.push({
      kind: "inferred",
      text: "Less than half of linked evidence is verified — verification is lagging behind delivery.",
    });
  if (lessons.length === 0)
    lessons.push({
      kind: "inferred",
      text: "Insufficient structured data to derive a reliable pattern.",
    });

  const followup: Line[] = [];
  if (verifiedEvidence.length < evidence.length)
    followup.push({
      kind: "recommended",
      text: "Review and verify the unverified linked evidence.",
    });
  if (overdue.length > 0)
    followup.push({ kind: "recommended", text: "Re-plan or close the overdue milestones." });
  if (evidence.length === 0)
    followup.push({
      kind: "recommended",
      text: "Capture evidence for the work delivered (consider GitHub evidence candidates).",
    });
  if (followup.length === 0)
    followup.push({
      kind: "recommended",
      text: "No immediate follow-up indicated by the recorded data.",
    });

  const unknowns: string[] = [
    "Business/production impact is not recorded in PEOS unless captured as production_metric evidence.",
    "This project is not linked to a GitHub repository projection, so commit/PR activity is not included.",
  ];

  return {
    generatedAt: now.toISOString(),
    project: { id: project.id, name: project.name, status: project.status },
    sourceCounts: {
      milestones: milestones.length,
      technologies: project.technologies.length,
      skills: project.skills.length,
      evidence: evidence.length,
      decisions: decisions.length,
    },
    sections: {
      overview,
      delivery,
      timeline: delivery,
      engineering,
      architecture,
      evidence: evidenceLines,
      risks,
      lessons,
      followup,
    },
    unknowns,
    rule: "retrospective-v1",
  };
}
