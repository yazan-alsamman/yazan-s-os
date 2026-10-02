import type { PrismaClient } from "@/generated/prisma/client";
import { paginated } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  evidenceRepository as repo,
  toEvidenceDetailDto,
  toEvidenceDto,
  toEvidenceListItem,
  type EvidenceDetailDto,
} from "./evidence.repository";
import type {
  CreateEvidenceInput,
  ListEvidenceQuery,
  UpdateEvidenceInput,
} from "./evidence.schemas";

/** `verified` toggles keep `verifiedAt` consistent (DB CHECK evidence_verified_at_chk). */
function verificationFields(verified: boolean | undefined, wasVerified: boolean) {
  if (verified === undefined || verified === wasVerified) return {};
  return { verified, verifiedAt: verified ? new Date() : null };
}

/**
 * Evidence records. Links to projects, skills, certifications and experiences are managed from
 * those owners; evidence exposes them read-only for navigation in both directions.
 */
export function createEvidenceService(db: PrismaClient) {
  async function getDetail(tx: Tx | PrismaClient, userId: string, id: string) {
    return toEvidenceDetailDto(requireFound(await repo.findOwnedDetail(tx, userId, id)));
  }

  return {
    async list(ctx: ServiceContext, query: ListEvidenceQuery) {
      const { rows, total } = await repo.list(db, ctx.userId, query);
      return paginated(rows.map(toEvidenceListItem), total, query);
    },

    get(ctx: ServiceContext, id: string): Promise<EvidenceDetailDto> {
      return getDetail(db, ctx.userId, id);
    },

    create(ctx: ServiceContext, input: CreateEvidenceInput): Promise<EvidenceDetailDto> {
      return db.$transaction(async (tx) => {
        const { verified, ...fields } = input;
        const evidence = await tx.evidence.create({
          data: {
            ...fields,
            ...verificationFields(verified, false),
            userId: ctx.userId,
            origin: "manual",
          },
        });
        await auditInTx(tx, ctx, {
          entity: "evidence",
          verb: "created",
          entityId: evidence.id,
          after: toEvidenceDto(evidence),
        });
        return getDetail(tx, ctx.userId, evidence.id);
      });
    },

    update(
      ctx: ServiceContext,
      id: string,
      input: UpdateEvidenceInput,
    ): Promise<EvidenceDetailDto> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        const { verified, ...fields } = input;
        const updated = await tx.evidence.update({
          where: { id: existing.id },
          data: { ...fields, ...verificationFields(verified, existing.verified) },
        });
        await auditInTx(tx, ctx, {
          entity: "evidence",
          verb: "updated",
          entityId: id,
          before: toEvidenceDto(existing),
          after: toEvidenceDto(updated),
        });
        return getDetail(tx, ctx.userId, id);
      });
    },

    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        await tx.evidence.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "evidence",
          verb: "deleted",
          entityId: id,
          before: toEvidenceDto(existing),
        });
      });
    },
  };
}
