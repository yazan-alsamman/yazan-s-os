import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { paginated } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { slugify } from "@/modules/shared/fields";
import { assertAllOwned, assertDateOrder, requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  projectSnapshot,
  toProjectDetailDto,
  toProjectListItem,
  type ProjectDetailDto,
} from "./project.dto";
import { projectRepository as repo } from "./project.repository";
import type {
  CreateProjectInput,
  ListProjectsQuery,
  TechnologyLinkInput,
  UpdateProjectInput,
} from "./project.schemas";

/** Find a free slug: base, base-2, base-3, … (bounded). */
async function uniqueSlug(tx: Tx, userId: string, base: string): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 76)}-${n}`;
    if (!(await repo.slugTaken(tx, userId, candidate))) return candidate;
  }
  return `${base.slice(0, 43)}-${crypto.randomUUID()}`;
}

async function writeSkills(tx: Tx, userId: string, projectId: string, skillIds: string[]) {
  const owned = await tx.skill.count({ where: { userId, id: { in: skillIds } } });
  assertAllOwned(owned, skillIds, "skillIds");
  await tx.projectSkill.deleteMany({ where: { userId, projectId } });
  if (skillIds.length) {
    await tx.projectSkill.createMany({
      data: skillIds.map((skillId) => ({ userId, projectId, skillId })),
    });
  }
}

async function writeTechnologies(
  tx: Tx,
  userId: string,
  projectId: string,
  items: TechnologyLinkInput[],
) {
  const ids = items.map((i) => i.technologyId);
  const owned = await tx.technology.count({ where: { userId, id: { in: ids } } });
  assertAllOwned(owned, ids, "technologies");
  await tx.technologyUsage.deleteMany({ where: { userId, projectId } });
  if (items.length) {
    await tx.technologyUsage.createMany({
      data: items.map((item) => ({
        userId,
        projectId,
        technologyId: item.technologyId,
        usageType: item.usageType,
        proficiencyEvidence: item.proficiencyEvidence ?? null,
      })),
    });
  }
}

async function writeEvidence(tx: Tx, userId: string, projectId: string, evidenceIds: string[]) {
  const owned = await tx.evidence.count({ where: { userId, id: { in: evidenceIds } } });
  assertAllOwned(owned, evidenceIds, "evidenceIds");
  await tx.projectEvidence.deleteMany({ where: { userId, projectId } });
  if (evidenceIds.length) {
    await tx.projectEvidence.createMany({
      data: evidenceIds.map((evidenceId) => ({ userId, projectId, evidenceId })),
    });
  }
}

async function relationSnapshot(tx: Tx, userId: string, projectId: string) {
  const detail = requireFound(await repo.findOwnedDetail(tx, userId, projectId));
  return {
    skillIds: detail.skills.map((s) => s.skillId),
    technologies: detail.technologies.map((t) => ({
      technologyId: t.technologyId,
      usageType: t.usageType,
    })),
    evidenceIds: detail.evidence.map((e) => e.evidenceId),
  };
}

export function createProjectService(db: PrismaClient) {
  async function getDetail(tx: Tx | PrismaClient, userId: string, id: string) {
    return toProjectDetailDto(requireFound(await repo.findOwnedDetail(tx, userId, id)));
  }

  return {
    async list(ctx: ServiceContext, query: ListProjectsQuery) {
      const { rows, total } = await repo.list(db, ctx.userId, query);
      return paginated(rows.map(toProjectListItem), total, query);
    },

    get(ctx: ServiceContext, id: string): Promise<ProjectDetailDto> {
      return getDetail(db, ctx.userId, id);
    },

    /** Create a project and its initial relationships atomically. */
    create(ctx: ServiceContext, input: CreateProjectInput): Promise<ProjectDetailDto> {
      return db.$transaction(async (tx) => {
        const { skillIds, technologies, evidenceIds, slug: requestedSlug, ...fields } = input;
        assertDateOrder(fields.startDate, fields.targetDate, "targetDate");
        assertDateOrder(fields.startDate, fields.completedAt, "completedAt");

        let slug: string;
        if (requestedSlug) {
          if (await repo.slugTaken(tx, ctx.userId, requestedSlug)) {
            throw new AppError("CONFLICT", {
              message: "Another project already uses this slug.",
              details: [{ path: "slug", message: "Already in use" }],
            });
          }
          slug = requestedSlug;
        } else {
          slug = await uniqueSlug(tx, ctx.userId, slugify(fields.name));
        }

        const project = await tx.project.create({
          data: { ...fields, slug, userId: ctx.userId, origin: "manual" },
        });
        if (skillIds) await writeSkills(tx, ctx.userId, project.id, skillIds);
        if (technologies) await writeTechnologies(tx, ctx.userId, project.id, technologies);
        if (evidenceIds) await writeEvidence(tx, ctx.userId, project.id, evidenceIds);

        await auditInTx(tx, ctx, {
          entity: "project",
          verb: "created",
          entityId: project.id,
          after: { ...projectSnapshot(project), skillIds, technologies, evidenceIds },
        });
        return getDetail(tx, ctx.userId, project.id);
      });
    },

    update(ctx: ServiceContext, id: string, input: UpdateProjectInput): Promise<ProjectDetailDto> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        const start = input.startDate !== undefined ? input.startDate : existing.startDate;
        const target = input.targetDate !== undefined ? input.targetDate : existing.targetDate;
        const completed =
          input.completedAt !== undefined ? input.completedAt : existing.completedAt;
        assertDateOrder(start, target, "targetDate");
        assertDateOrder(start, completed, "completedAt");

        if (input.slug && input.slug !== existing.slug) {
          if (await repo.slugTaken(tx, ctx.userId, input.slug, id)) {
            throw new AppError("CONFLICT", {
              message: "Another project already uses this slug.",
              details: [{ path: "slug", message: "Already in use" }],
            });
          }
        }

        const updated = await tx.project.update({ where: { id: existing.id }, data: input });
        await auditInTx(tx, ctx, {
          entity: "project",
          verb: "updated",
          entityId: id,
          before: projectSnapshot(existing),
          after: projectSnapshot(updated),
        });
        return getDetail(tx, ctx.userId, id);
      });
    },

    /** Hard delete; relationship rows cascade. The audit entry keeps the final state. */
    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        const relations = await relationSnapshot(tx, ctx.userId, id);
        await tx.project.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "project",
          verb: "deleted",
          entityId: id,
          before: { ...projectSnapshot(existing), ...relations },
        });
      });
    },

    replaceSkills(ctx: ServiceContext, id: string, skillIds: string[]) {
      return replaceRelations(ctx, id, (tx) => writeSkills(tx, ctx.userId, id, skillIds));
    },

    replaceTechnologies(ctx: ServiceContext, id: string, items: TechnologyLinkInput[]) {
      return replaceRelations(ctx, id, (tx) => writeTechnologies(tx, ctx.userId, id, items));
    },

    replaceEvidence(ctx: ServiceContext, id: string, evidenceIds: string[]) {
      return replaceRelations(ctx, id, (tx) => writeEvidence(tx, ctx.userId, id, evidenceIds));
    },
  };

  function replaceRelations(
    ctx: ServiceContext,
    id: string,
    write: (tx: Tx) => Promise<void>,
  ): Promise<ProjectDetailDto> {
    return db.$transaction(async (tx) => {
      requireFound(await repo.findOwned(tx, ctx.userId, id));
      const before = await relationSnapshot(tx, ctx.userId, id);
      await write(tx);
      const after = await relationSnapshot(tx, ctx.userId, id);
      await auditInTx(tx, ctx, {
        entity: "project",
        verb: "relations_updated",
        entityId: id,
        before,
        after,
      });
      return getDetail(tx, ctx.userId, id);
    });
  }
}

export type ProjectService = ReturnType<typeof createProjectService>;
