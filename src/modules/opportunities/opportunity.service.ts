import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { paginated } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";
import { assertAllOwned, requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { computeFit, type FitRequirementResult } from "./opportunity.matching";
import {
  opportunityRepository as repo,
  opportunitySnapshot,
  toOpportunityDetailDto,
  toOpportunityListItem,
  toRequirementDto,
  type OpportunityDetailDto,
  type RequirementDto,
} from "./opportunity.repository";
import type {
  CreateOpportunityInput,
  CreateRequirementInput,
  ListOpportunitiesQuery,
  UpdateOpportunityInput,
  UpdateRequirementInput,
} from "./opportunity.schemas";

type ConcreteLink = { skillId: string | null; technologyId: string | null; certificationId: string | null };

/**
 * Opportunities, their structured requirements, and transparent evidence-to-requirement matching
 * (01 §11; ADR 0056). Requirements may link to an owned skill/technology/certification; that link is
 * used only to *suggest* supporting evidence — matching itself counts only explicit evidence maps.
 */
export function createOpportunityService(db: PrismaClient) {
  async function getDetail(tx: Tx | PrismaClient, userId: string, id: string) {
    return toOpportunityDetailDto(requireFound(await repo.findOwnedDetail(tx, userId, id)));
  }

  /** Validate that any provided concrete link is owned and matches the requirement kind. */
  async function resolveConcreteLink(
    tx: Tx,
    userId: string,
    kind: string,
    input: { skillId?: string | null; technologyId?: string | null; certificationId?: string | null },
  ): Promise<ConcreteLink> {
    const link: ConcreteLink = { skillId: null, technologyId: null, certificationId: null };
    async function assertOwned(model: "skill" | "technology" | "certification", id: string) {
      const count = await (tx[model] as { count: (a: unknown) => Promise<number> }).count({
        where: { id, userId },
      });
      if (count !== 1) {
        throw new AppError("VALIDATION_FAILED", {
          message: "The linked record does not exist.",
          details: [{ path: `${model}Id`, message: "The linked record does not exist." }],
        });
      }
    }
    if (kind === "skill" && input.skillId) {
      await assertOwned("skill", input.skillId);
      link.skillId = input.skillId;
    } else if (kind === "technology" && input.technologyId) {
      await assertOwned("technology", input.technologyId);
      link.technologyId = input.technologyId;
    } else if (kind === "certification" && input.certificationId) {
      await assertOwned("certification", input.certificationId);
      link.certificationId = input.certificationId;
    }
    return link;
  }

  async function getRequirementDto(tx: Tx, userId: string, requirementId: string): Promise<RequirementDto> {
    const record = await tx.opportunityRequirement.findFirst({
      where: { id: requirementId, userId },
      include: {
        skill: { select: { id: true, name: true } },
        technology: { select: { id: true, name: true } },
        certification: { select: { id: true, name: true, issuer: true } },
        evidenceLinks: {
          include: {
            evidence: {
              select: {
                id: true,
                title: true,
                type: true,
                date: true,
                verified: true,
                githubResourceType: true,
              },
            },
          },
          orderBy: { evidence: { date: "desc" } },
        },
      },
    });
    return toRequirementDto(requireFound(record));
  }

  return {
    async list(ctx: ServiceContext, query: ListOpportunitiesQuery) {
      const { rows, total } = await repo.list(db, ctx.userId, query);
      return paginated(rows.map(toOpportunityListItem), total, query);
    },

    get(ctx: ServiceContext, id: string): Promise<OpportunityDetailDto> {
      return getDetail(db, ctx.userId, id);
    },

    create(ctx: ServiceContext, input: CreateOpportunityInput): Promise<OpportunityDetailDto> {
      return db.$transaction(async (tx) => {
        const opportunity = await tx.opportunity.create({
          data: { ...input, userId: ctx.userId, origin: "manual" },
        });
        await auditInTx(tx, ctx, {
          entity: "opportunity",
          verb: "created",
          entityId: opportunity.id,
          after: opportunitySnapshot(opportunity),
        });
        return getDetail(tx, ctx.userId, opportunity.id);
      });
    },

    update(ctx: ServiceContext, id: string, input: UpdateOpportunityInput): Promise<OpportunityDetailDto> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        const updated = await tx.opportunity.update({ where: { id: existing.id }, data: input });
        await auditInTx(tx, ctx, {
          entity: "opportunity",
          verb: "updated",
          entityId: id,
          before: opportunitySnapshot(existing),
          after: opportunitySnapshot(updated),
        });
        return getDetail(tx, ctx.userId, id);
      });
    },

    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        await tx.opportunity.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "opportunity",
          verb: "deleted",
          entityId: id,
          before: opportunitySnapshot(existing),
        });
      });
    },

    addRequirement(ctx: ServiceContext, opportunityId: string, input: CreateRequirementInput): Promise<RequirementDto> {
      return db.$transaction(async (tx) => {
        requireFound(await repo.findOwned(tx, ctx.userId, opportunityId));
        const link = await resolveConcreteLink(tx, ctx.userId, input.kind, input);
        const requirement = await tx.opportunityRequirement.create({
          data: {
            userId: ctx.userId,
            opportunityId,
            kind: input.kind,
            label: input.label,
            description: input.description ?? null,
            importance: input.importance ?? "required",
            ...link,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "opportunity_requirement",
          verb: "created",
          entityId: requirement.id,
          after: { opportunityId, kind: requirement.kind, label: requirement.label, importance: requirement.importance },
        });
        return getRequirementDto(tx, ctx.userId, requirement.id);
      });
    },

    updateRequirement(ctx: ServiceContext, requirementId: string, input: UpdateRequirementInput): Promise<RequirementDto> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwnedRequirement(tx, ctx.userId, requirementId));
        const kind = input.kind ?? existing.kind;
        // When kind or any concrete id is part of the update, re-resolve the (single) concrete link.
        const touchesLink =
          input.kind !== undefined ||
          input.skillId !== undefined ||
          input.technologyId !== undefined ||
          input.certificationId !== undefined;
        const link = touchesLink
          ? await resolveConcreteLink(tx, ctx.userId, kind, {
              skillId: input.skillId ?? (kind === existing.kind ? existing.skillId : null),
              technologyId: input.technologyId ?? (kind === existing.kind ? existing.technologyId : null),
              certificationId:
                input.certificationId ?? (kind === existing.kind ? existing.certificationId : null),
            })
          : null;
        const data: Prisma.OpportunityRequirementUpdateInput = {
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.importance !== undefined ? { importance: input.importance } : {}),
          ...(link ? link : {}),
        };
        await tx.opportunityRequirement.update({ where: { id: existing.id }, data });
        await auditInTx(tx, ctx, {
          entity: "opportunity_requirement",
          verb: "updated",
          entityId: requirementId,
          before: { kind: existing.kind, label: existing.label, importance: existing.importance },
        });
        return getRequirementDto(tx, ctx.userId, requirementId);
      });
    },

    deleteRequirement(ctx: ServiceContext, requirementId: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwnedRequirement(tx, ctx.userId, requirementId));
        await tx.opportunityRequirement.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "opportunity_requirement",
          verb: "deleted",
          entityId: requirementId,
          before: { opportunityId: existing.opportunityId, label: existing.label },
        });
      });
    },

    /** Replace the full evidence set mapped to a requirement (ADR 0015 replace-set semantics). */
    replaceRequirementEvidence(ctx: ServiceContext, requirementId: string, evidenceIds: string[]): Promise<RequirementDto> {
      return db.$transaction(async (tx) => {
        requireFound(await repo.findOwnedRequirement(tx, ctx.userId, requirementId));
        const owned = await tx.evidence.count({ where: { userId: ctx.userId, id: { in: evidenceIds } } });
        assertAllOwned(owned, evidenceIds, "evidenceIds");
        await tx.requirementEvidence.deleteMany({ where: { userId: ctx.userId, requirementId } });
        if (evidenceIds.length) {
          await tx.requirementEvidence.createMany({
            data: evidenceIds.map((evidenceId) => ({ userId: ctx.userId, requirementId, evidenceId })),
          });
        }
        await auditInTx(tx, ctx, {
          entity: "opportunity_requirement",
          verb: "relations_updated",
          entityId: requirementId,
          after: { evidenceIds: [...evidenceIds].sort() },
        });
        return getRequirementDto(tx, ctx.userId, requirementId);
      });
    },

    /**
     * The transparent fit view: per-requirement status/strength, decomposable coverage counts, and
     * grounded evidence suggestions (evidence already linked to the requirement's concrete
     * skill/technology/certification but not yet mapped). Never fabricates a match or a score.
     */
    async getFit(ctx: ServiceContext, id: string) {
      const detail = await getDetail(db, ctx.userId, id);
      const fit = computeFit(
        detail.requirements.map((r) => ({
          id: r.id,
          importance: r.importance,
          evidence: r.evidence.map((e) => ({ verified: e.verified })),
        })),
      );
      const byId = new Map<string, FitRequirementResult>(fit.requirements.map((r) => [r.id, r]));

      const suggestions = await Promise.all(
        detail.requirements.map(async (r) => {
          const mapped = r.evidence.map((e) => e.id);
          const where = suggestionWhere(ctx.userId, r, mapped);
          if (!where) return [] as RequirementDto["evidence"];
          const rows = await db.evidence.findMany({
            where,
            select: { id: true, title: true, type: true, date: true, verified: true, githubResourceType: true },
            orderBy: [{ verified: "desc" }, { date: "desc" }],
            take: 10,
          });
          return rows.map((e) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            date: toDateOnly(e.date),
            verified: e.verified,
            github: e.githubResourceType !== null,
          }));
        }),
      );

      return {
        calculatedAt: new Date().toISOString(),
        opportunity: {
          id: detail.id,
          title: detail.title,
          organization: detail.organization,
          status: detail.status,
          type: detail.type,
        },
        coverage: { required: fit.required, preferred: fit.preferred, requiredCoverage: fit.requiredCoverage },
        requirements: detail.requirements.map((r, i) => ({
          ...r,
          status: byId.get(r.id)!.status,
          strength: byId.get(r.id)!.strength,
          suggestions: suggestions[i] ?? [],
        })),
      };
    },
  };
}

/** Evidence candidates for a requirement, grounded in its concrete link; null when it has none. */
function suggestionWhere(
  userId: string,
  r: RequirementDto,
  mapped: string[],
): Prisma.EvidenceWhereInput | null {
  const notMapped = { id: { notIn: mapped.length ? mapped : ["00000000-0000-0000-0000-000000000000"] } };
  if (r.kind === "skill" && r.skill) {
    return { userId, skills: { some: { skillId: r.skill.id } }, ...notMapped };
  }
  if (r.kind === "certification" && r.certification) {
    return { userId, certifications: { some: { certificationId: r.certification.id } }, ...notMapped };
  }
  if (r.kind === "technology" && r.technology) {
    return {
      userId,
      projects: { some: { project: { technologies: { some: { technologyId: r.technology.id } } } } },
      ...notMapped,
    };
  }
  return null;
}

export type OpportunityService = ReturnType<typeof createOpportunityService>;
