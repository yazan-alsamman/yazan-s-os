import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { paginated } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { normalizeKey } from "@/modules/shared/fields";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  technologyRepository as repo,
  toTechnologyDetailDto,
  toTechnologyDto,
  toTechnologyListItem,
  type TechnologyDetailDto,
} from "./technology.repository";
import type {
  CreateTechnologyInput,
  ListTechnologiesQuery,
  UpdateTechnologyInput,
} from "./technology.schemas";

function duplicateName(): AppError {
  return new AppError("CONFLICT", {
    message: "You already have a technology with this name.",
    details: [{ path: "name", message: "Already exists" }],
  });
}

/** Technologies. Project usage is managed from the project side (PUT /projects/:id/technologies). */
export function createTechnologyService(db: PrismaClient) {
  async function getDetail(tx: Tx | PrismaClient, userId: string, id: string) {
    return toTechnologyDetailDto(requireFound(await repo.findOwnedDetail(tx, userId, id)));
  }

  return {
    async list(ctx: ServiceContext, query: ListTechnologiesQuery) {
      const { rows, total } = await repo.list(db, ctx.userId, query);
      return paginated(rows.map(toTechnologyListItem), total, query);
    },

    get(ctx: ServiceContext, id: string): Promise<TechnologyDetailDto> {
      return getDetail(db, ctx.userId, id);
    },

    create(ctx: ServiceContext, input: CreateTechnologyInput): Promise<TechnologyDetailDto> {
      return db.$transaction(async (tx) => {
        const key = normalizeKey(input.name);
        if (await repo.keyTaken(tx, ctx.userId, key)) throw duplicateName();
        const technology = await tx.technology.create({
          data: { ...input, key, userId: ctx.userId, origin: "manual" },
        });
        await auditInTx(tx, ctx, {
          entity: "technology",
          verb: "created",
          entityId: technology.id,
          after: toTechnologyDto(technology),
        });
        return getDetail(tx, ctx.userId, technology.id);
      });
    },

    update(
      ctx: ServiceContext,
      id: string,
      input: UpdateTechnologyInput,
    ): Promise<TechnologyDetailDto> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        const data: UpdateTechnologyInput & { key?: string } = { ...input };
        if (input.name) {
          data.key = normalizeKey(input.name);
          if (await repo.keyTaken(tx, ctx.userId, data.key, id)) throw duplicateName();
        }
        const updated = await tx.technology.update({ where: { id: existing.id }, data });
        await auditInTx(tx, ctx, {
          entity: "technology",
          verb: "updated",
          entityId: id,
          before: toTechnologyDto(existing),
          after: toTechnologyDto(updated),
        });
        return getDetail(tx, ctx.userId, id);
      });
    },

    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        await tx.technology.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "technology",
          verb: "deleted",
          entityId: id,
          before: toTechnologyDto(existing),
        });
      });
    },
  };
}
