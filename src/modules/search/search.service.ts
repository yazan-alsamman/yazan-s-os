import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { paginated, paginationQuerySchema, toSkipTake } from "@/lib/http/pagination";
import type { ServiceContext } from "@/modules/shared/service-context";

/**
 * Global search (01 §14) over Phase 1 entities: user-scoped, parameterised (Prisma), escaped
 * case-insensitive substring matching, deterministic ordering, bounded results. Semantic search
 * (pgvector) arrives in Phase 8.
 */
export const SEARCH_TYPES = [
  "project",
  "skill",
  "technology",
  "certification",
  "evidence",
  "experience",
  "education",
] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export const searchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1, "Enter a search term").max(200),
  /** Restrict to one type to get paginated results; omit for grouped top results. */
  type: z.enum(SEARCH_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

type Term = { contains: string; mode: "insensitive" };

interface Searcher {
  count(db: PrismaClient, userId: string, term: Term): Promise<number>;
  find(
    db: PrismaClient,
    userId: string,
    term: Term,
    skip: number,
    take: number,
  ): Promise<SearchHit[]>;
}

const searchers: Record<SearchType, Searcher> = {
  project: {
    count: (db, userId, t) =>
      db.project.count({ where: { userId, OR: [{ name: t }, { slug: t }, { description: t }] } }),
    find: async (db, userId, t, skip, take) =>
      (
        await db.project.findMany({
          where: { userId, OR: [{ name: t }, { slug: t }, { description: t }] },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip,
          take,
          select: { id: true, name: true, status: true },
        })
      ).map((p) => ({
        type: "project",
        id: p.id,
        title: p.name,
        subtitle: p.status,
        href: `/projects/${p.id}`,
      })),
  },
  skill: {
    count: (db, userId, t) =>
      db.skill.count({ where: { userId, OR: [{ name: t }, { category: t }, { description: t }] } }),
    find: async (db, userId, t, skip, take) =>
      (
        await db.skill.findMany({
          where: { userId, OR: [{ name: t }, { category: t }, { description: t }] },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip,
          take,
          select: { id: true, name: true, category: true },
        })
      ).map((s) => ({
        type: "skill",
        id: s.id,
        title: s.name,
        subtitle: s.category,
        href: `/skills/${s.id}`,
      })),
  },
  technology: {
    count: (db, userId, t) =>
      db.technology.count({ where: { userId, OR: [{ name: t }, { category: t }, { notes: t }] } }),
    find: async (db, userId, t, skip, take) =>
      (
        await db.technology.findMany({
          where: { userId, OR: [{ name: t }, { category: t }, { notes: t }] },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip,
          take,
          select: { id: true, name: true, category: true },
        })
      ).map((x) => ({
        type: "technology",
        id: x.id,
        title: x.name,
        subtitle: x.category,
        href: `/skills/technologies/${x.id}`,
      })),
  },
  certification: {
    count: (db, userId, t) =>
      db.certification.count({
        where: { userId, OR: [{ name: t }, { issuer: t }, { category: t }, { credentialId: t }] },
      }),
    find: async (db, userId, t, skip, take) =>
      (
        await db.certification.findMany({
          where: { userId, OR: [{ name: t }, { issuer: t }, { category: t }, { credentialId: t }] },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip,
          take,
          select: { id: true, name: true, issuer: true },
        })
      ).map((c) => ({
        type: "certification",
        id: c.id,
        title: c.name,
        subtitle: c.issuer,
        href: `/certifications/${c.id}`,
      })),
  },
  evidence: {
    count: (db, userId, t) =>
      db.evidence.count({ where: { userId, OR: [{ title: t }, { description: t }] } }),
    find: async (db, userId, t, skip, take) =>
      (
        await db.evidence.findMany({
          where: { userId, OR: [{ title: t }, { description: t }] },
          orderBy: [{ title: "asc" }, { id: "asc" }],
          skip,
          take,
          select: { id: true, title: true, type: true },
        })
      ).map((e) => ({
        type: "evidence",
        id: e.id,
        title: e.title,
        subtitle: e.type,
        href: `/evidence/${e.id}`,
      })),
  },
  experience: {
    count: (db, userId, t) =>
      db.experience.count({
        where: { userId, OR: [{ organization: t }, { title: t }, { description: t }] },
      }),
    find: async (db, userId, t, skip, take) =>
      (
        await db.experience.findMany({
          where: { userId, OR: [{ organization: t }, { title: t }, { description: t }] },
          orderBy: [{ startDate: "desc" }, { id: "asc" }],
          skip,
          take,
          select: { id: true, title: true, organization: true },
        })
      ).map((e) => ({
        type: "experience",
        id: e.id,
        title: e.title,
        subtitle: e.organization,
        href: `/career/experience/${e.id}`,
      })),
  },
  education: {
    count: (db, userId, t) =>
      db.education.count({
        where: { userId, OR: [{ institution: t }, { degree: t }, { fieldOfStudy: t }] },
      }),
    find: async (db, userId, t, skip, take) =>
      (
        await db.education.findMany({
          where: { userId, OR: [{ institution: t }, { degree: t }, { fieldOfStudy: t }] },
          orderBy: [{ institution: "asc" }, { id: "asc" }],
          skip,
          take,
          select: { id: true, institution: true, degree: true },
        })
      ).map((e) => ({
        type: "education",
        id: e.id,
        title: e.institution,
        subtitle: e.degree,
        href: `/career/education`,
      })),
  },
};

export function createSearchService(db: PrismaClient) {
  return {
    /** Grouped top results per type, or a paginated list for a single type. */
    async search(ctx: ServiceContext, query: SearchQuery) {
      const term: Term = { contains: escapeLike(query.q), mode: "insensitive" };
      if (query.type) {
        const searcher = searchers[query.type];
        const { skip, take } = toSkipTake(query);
        const [hits, total] = await Promise.all([
          searcher.find(db, ctx.userId, term, skip, take),
          searcher.count(db, ctx.userId, term),
        ]);
        return { mode: "type" as const, ...paginated(hits, total, query) };
      }
      const groups = await Promise.all(
        SEARCH_TYPES.map(async (type) => {
          const [hits, total] = await Promise.all([
            searchers[type].find(db, ctx.userId, term, 0, query.limit),
            searchers[type].count(db, ctx.userId, term),
          ]);
          return { type, total, hits };
        }),
      );
      return { mode: "grouped" as const, data: groups.filter((g) => g.total > 0) };
    },
  };
}
