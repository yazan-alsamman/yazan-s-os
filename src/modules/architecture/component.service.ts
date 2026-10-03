import type { ArchitectureComponent, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { normalizeKey } from "@/modules/shared/fields";
import { assertAllOwned, requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { MAX_COMPONENTS_PER_USER } from "./architecture.rules";
import type { CreateComponentInput, UpdateComponentInput } from "./architecture.schemas";

/**
 * Component registry (Phase 7, ADR 0043): architecture map nodes with explicit, owner-scoped links
 * to existing Projects and Technologies (no duplicate registry) and explicit dependencies.
 */

export function componentSnapshot(c: ArchitectureComponent) {
  return { id: c.id, name: c.name, type: c.type, purpose: c.purpose, critical: c.critical };
}

export function toComponentDto(c: ArchitectureComponent) {
  return {
    ...componentSnapshot(c),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
export type ComponentDto = ReturnType<typeof toComponentDto>;

function duplicateName(): AppError {
  return new AppError("CONFLICT", {
    message: "You already have a component with this name.",
    details: [{ path: "name", message: "Already exists" }],
  });
}

async function findOwned(tx: Tx | PrismaClient, userId: string, id: string) {
  return requireFound(await tx.architectureComponent.findFirst({ where: { id, userId } }));
}

async function keyTaken(tx: Tx, userId: string, key: string, exceptId?: string) {
  return (
    (await tx.architectureComponent.count({
      where: { userId, key, ...(exceptId ? { id: { not: exceptId } } : {}) },
    })) > 0
  );
}

export function createComponentService(db: PrismaClient) {
  async function replaceLinks(
    ctx: ServiceContext,
    componentId: string,
    kind: "projects" | "technologies" | "dependencies",
    ids: string[],
  ) {
    return db.$transaction(async (tx) => {
      await findOwned(tx, ctx.userId, componentId);
      const userId = ctx.userId;
      let before: string[];
      if (kind === "projects") {
        assertAllOwned(
          await tx.project.count({ where: { userId, id: { in: ids } } }),
          ids,
          "projectIds",
        );
        before = (
          await tx.componentProject.findMany({
            where: { userId, componentId },
            select: { projectId: true },
          })
        ).map((r) => r.projectId);
        await tx.componentProject.deleteMany({ where: { userId, componentId } });
        if (ids.length)
          await tx.componentProject.createMany({
            data: ids.map((projectId) => ({ userId, componentId, projectId })),
          });
      } else if (kind === "technologies") {
        assertAllOwned(
          await tx.technology.count({ where: { userId, id: { in: ids } } }),
          ids,
          "technologyIds",
        );
        before = (
          await tx.componentTechnology.findMany({
            where: { userId, componentId },
            select: { technologyId: true },
          })
        ).map((r) => r.technologyId);
        await tx.componentTechnology.deleteMany({ where: { userId, componentId } });
        if (ids.length)
          await tx.componentTechnology.createMany({
            data: ids.map((technologyId) => ({ userId, componentId, technologyId })),
          });
      } else {
        if (ids.includes(componentId)) {
          throw new AppError("VALIDATION_FAILED", {
            details: [{ path: "componentIds", message: "A component cannot depend on itself." }],
          });
        }
        assertAllOwned(
          await tx.architectureComponent.count({ where: { userId, id: { in: ids } } }),
          ids,
          "componentIds",
        );
        before = (
          await tx.componentDependency.findMany({
            where: { userId, componentId },
            select: { dependsOnComponentId: true },
          })
        ).map((r) => r.dependsOnComponentId);
        await tx.componentDependency.deleteMany({ where: { userId, componentId } });
        if (ids.length)
          await tx.componentDependency.createMany({
            data: ids.map((dependsOnComponentId) => ({
              userId,
              componentId,
              dependsOnComponentId,
            })),
          });
      }
      const key =
        kind === "projects"
          ? "projectIds"
          : kind === "technologies"
            ? "technologyIds"
            : "dependsOnComponentIds";
      await auditInTx(tx, ctx, {
        entity: "architecture_component",
        verb: "relations_updated",
        entityId: componentId,
        before: { [key]: [...before].sort() },
        after: { [key]: [...ids].sort() },
      });
      return toComponentDto(await findOwned(tx, userId, componentId));
    });
  }

  return {
    async get(ctx: ServiceContext, id: string) {
      return toComponentDto(await findOwned(db, ctx.userId, id));
    },

    create(ctx: ServiceContext, input: CreateComponentInput) {
      return db.$transaction(async (tx) => {
        if (
          (await tx.architectureComponent.count({ where: { userId: ctx.userId } })) >=
          MAX_COMPONENTS_PER_USER
        ) {
          throw new AppError("VALIDATION_FAILED", {
            message: `You can have at most ${MAX_COMPONENTS_PER_USER} architecture components.`,
          });
        }
        const key = normalizeKey(input.name);
        if (await keyTaken(tx, ctx.userId, key)) throw duplicateName();
        const created = await tx.architectureComponent.create({
          data: {
            userId: ctx.userId,
            name: input.name,
            key,
            type: input.type,
            purpose: input.purpose ?? null,
            critical: input.critical ?? false,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "architecture_component",
          verb: "created",
          entityId: created.id,
          after: componentSnapshot(created),
        });
        return toComponentDto(created);
      });
    },

    update(ctx: ServiceContext, id: string, input: UpdateComponentInput) {
      return db.$transaction(async (tx) => {
        const before = await findOwned(tx, ctx.userId, id);
        let key: string | undefined;
        if (input.name) {
          key = normalizeKey(input.name);
          if (await keyTaken(tx, ctx.userId, key, id)) throw duplicateName();
        }
        const updated = await tx.architectureComponent.update({
          where: { id },
          data: { ...input, ...(key ? { key } : {}) },
        });
        await auditInTx(tx, ctx, {
          entity: "architecture_component",
          verb: "updated",
          entityId: id,
          before: componentSnapshot(before),
          after: componentSnapshot(updated),
        });
        return toComponentDto(updated);
      });
    },

    /** Removes the component and its links (decisions, projects, technologies, dependencies). */
    delete(ctx: ServiceContext, id: string) {
      return db.$transaction(async (tx) => {
        const before = await findOwned(tx, ctx.userId, id);
        await tx.architectureComponent.delete({ where: { id } });
        await auditInTx(tx, ctx, {
          entity: "architecture_component",
          verb: "deleted",
          entityId: id,
          before: componentSnapshot(before),
        });
      });
    },

    replaceProjects: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "projects", ids),
    replaceTechnologies: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "technologies", ids),
    replaceDependencies: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "dependencies", ids),
  };
}
