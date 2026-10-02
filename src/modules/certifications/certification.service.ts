import type { PrismaClient } from "@/generated/prisma/client";
import { paginated } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { assertAllOwned, assertDateOrder, requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  certificationRepository as repo,
  certificationSnapshot,
  toCertificationDetailDto,
  toCertificationListItem,
  type CertificationDetailDto,
} from "./certification.repository";
import type {
  CreateCertificationInput,
  ListCertificationsQuery,
  UpdateCertificationInput,
} from "./certification.schemas";

/**
 * Certifications. Linking a skill records that the certification is *related to* the skill; it
 * never asserts proficiency (01 §7, 06 grounding rule 7).
 */
export function createCertificationService(db: PrismaClient) {
  async function getDetail(tx: Tx | PrismaClient, userId: string, id: string) {
    return toCertificationDetailDto(requireFound(await repo.findOwnedDetail(tx, userId, id)));
  }

  async function relationSnapshot(tx: Tx, userId: string, certificationId: string) {
    const [skills, evidence] = await Promise.all([
      tx.certificationSkill.findMany({
        where: { userId, certificationId },
        orderBy: { skillId: "asc" },
      }),
      tx.certificationEvidence.findMany({
        where: { userId, certificationId },
        orderBy: { evidenceId: "asc" },
      }),
    ]);
    return {
      skillIds: skills.map((s) => s.skillId),
      evidenceIds: evidence.map((e) => e.evidenceId),
    };
  }

  function replaceRelations(
    ctx: ServiceContext,
    id: string,
    write: (tx: Tx) => Promise<void>,
  ): Promise<CertificationDetailDto> {
    return db.$transaction(async (tx) => {
      requireFound(await repo.findOwned(tx, ctx.userId, id));
      const before = await relationSnapshot(tx, ctx.userId, id);
      await write(tx);
      await auditInTx(tx, ctx, {
        entity: "certification",
        verb: "relations_updated",
        entityId: id,
        before,
        after: await relationSnapshot(tx, ctx.userId, id),
      });
      return getDetail(tx, ctx.userId, id);
    });
  }

  return {
    async list(ctx: ServiceContext, query: ListCertificationsQuery) {
      const { rows, total } = await repo.list(db, ctx.userId, query);
      return paginated(rows.map(toCertificationListItem), total, query);
    },

    get(ctx: ServiceContext, id: string): Promise<CertificationDetailDto> {
      return getDetail(db, ctx.userId, id);
    },

    create(ctx: ServiceContext, input: CreateCertificationInput): Promise<CertificationDetailDto> {
      return db.$transaction(async (tx) => {
        assertDateOrder(
          input.issueDate,
          input.expiryDate,
          "expiryDate",
          "Expiry date must not be before the issue date",
        );
        const certification = await tx.certification.create({
          data: { ...input, userId: ctx.userId, origin: "manual" },
        });
        await auditInTx(tx, ctx, {
          entity: "certification",
          verb: "created",
          entityId: certification.id,
          after: certificationSnapshot(certification),
        });
        return getDetail(tx, ctx.userId, certification.id);
      });
    },

    update(
      ctx: ServiceContext,
      id: string,
      input: UpdateCertificationInput,
    ): Promise<CertificationDetailDto> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        assertDateOrder(
          input.issueDate !== undefined ? input.issueDate : existing.issueDate,
          input.expiryDate !== undefined ? input.expiryDate : existing.expiryDate,
          "expiryDate",
          "Expiry date must not be before the issue date",
        );
        const updated = await tx.certification.update({ where: { id: existing.id }, data: input });
        await auditInTx(tx, ctx, {
          entity: "certification",
          verb: "updated",
          entityId: id,
          before: certificationSnapshot(existing),
          after: certificationSnapshot(updated),
        });
        return getDetail(tx, ctx.userId, id);
      });
    },

    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        const relations = await relationSnapshot(tx, ctx.userId, id);
        await tx.certification.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "certification",
          verb: "deleted",
          entityId: id,
          before: { ...certificationSnapshot(existing), ...relations },
        });
      });
    },

    replaceSkills(ctx: ServiceContext, id: string, skillIds: string[]) {
      return replaceRelations(ctx, id, async (tx) => {
        const owned = await tx.skill.count({ where: { userId: ctx.userId, id: { in: skillIds } } });
        assertAllOwned(owned, skillIds, "skillIds");
        await tx.certificationSkill.deleteMany({
          where: { userId: ctx.userId, certificationId: id },
        });
        if (skillIds.length) {
          await tx.certificationSkill.createMany({
            data: skillIds.map((skillId) => ({ userId: ctx.userId, certificationId: id, skillId })),
          });
        }
      });
    },

    replaceEvidence(ctx: ServiceContext, id: string, evidenceIds: string[]) {
      return replaceRelations(ctx, id, async (tx) => {
        const owned = await tx.evidence.count({
          where: { userId: ctx.userId, id: { in: evidenceIds } },
        });
        assertAllOwned(owned, evidenceIds, "evidenceIds");
        await tx.certificationEvidence.deleteMany({
          where: { userId: ctx.userId, certificationId: id },
        });
        if (evidenceIds.length) {
          await tx.certificationEvidence.createMany({
            data: evidenceIds.map((evidenceId) => ({
              userId: ctx.userId,
              certificationId: id,
              evidenceId,
            })),
          });
        }
      });
    },
  };
}
