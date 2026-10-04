import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { resolvePeriod, type Period } from "@/modules/analytics/period";
import { utcDay } from "@/modules/shared/calendar";

import { integrationRepository as repo } from "../integration.repository";

import type { RepoDto } from "./github.normalize";

/**
 * Shared GitHub-intelligence helpers (Phase 9.6/9.7). One place for the connection guard, the
 * GitHub period presets (which include 7d/180d that the shared resolver lacks) and the repository
 * cache reader, so the analytics and insights services never drift apart.
 */
export type RepoMeta = Partial<RepoDto> & { externalId: string; fullName: string };

export const DAY = 86_400_000;

export interface RangeFilters {
  range: string;
  from?: Date;
  to?: Date;
}

/** Resolve GitHub period presets (incl. 7d/180d) to a Period. */
export function resolveGhPeriod(filters: RangeFilters, now: Date): Period {
  const presetDays: Record<string, number> = { "7d": 7, "180d": 180 };
  if (filters.range in presetDays) {
    const days = presetDays[filters.range]!;
    const end = utcDay(now);
    const start = new Date(end.getTime() - (days - 1) * DAY);
    return { range: "custom", start, end, days, label: `Last ${days} days` };
  }
  return resolvePeriod(filters as never, now);
}

export async function requireGithub(db: PrismaClient, userId: string) {
  const conn = await repo.findActiveByProvider(db, userId, "github");
  if (!conn || !conn.accessTokenEnc) throw new AppError("INTEGRATION_NOT_CONNECTED");
  return conn;
}

export async function cachedRepos(db: PrismaClient, userId: string): Promise<RepoMeta[]> {
  const rows = await db.integrationExternalResource.findMany({
    where: { userId, provider: "github", resourceType: "repository" },
    select: { metadata: true },
    take: 2000,
  });
  return rows.map((r) => r.metadata as unknown as RepoMeta);
}

/** Half-open upper bound for a timestamp column (end day inclusive), or null when unbounded. */
export function periodUpperBound(period: Period): Date | null {
  return period.end ? new Date(period.end.getTime() + DAY) : null;
}
