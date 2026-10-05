import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Automatic evidence *candidate* extraction (Phase 13, ADR 0060). Derives candidate evidence from
 * meaningful, explicit GitHub artifacts already synchronized into PEOS — published releases and
 * merged pull requests — never from raw commits (a commit is not, by itself, professional evidence).
 * Candidates are suggestions requiring human review; they are deduplicated by (userId, sourceType,
 * sourceId) so re-running never creates duplicates and never resurrects a rejected/accepted one.
 * Extraction records only what the source states — it never infers business/production outcomes.
 */

export const EXTRACTION_RELEASE_LIMIT = 100;
export const EXTRACTION_PR_LIMIT = 100;

interface CandidateInput {
  sourceType: "github_release" | "github_pull_request";
  sourceId: string;
  suggestedType: "repository";
  suggestedTitle: string;
  suggestedDate: Date | null;
  sourceUrl: string | null;
  repoFullName: string;
  confidence: "low" | "medium" | "high";
  method: string;
  githubResourceType: string;
  githubResourceId: string;
}

function clampTitle(s: string): string {
  return s.length > 300 ? `${s.slice(0, 297)}…` : s;
}

export async function extractCandidates(
  db: PrismaClient,
  userId: string,
): Promise<{ scanned: number; created: number }> {
  const [releases, pulls] = await Promise.all([
    db.gitHubRelease.findMany({
      where: { userId, draft: false, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: EXTRACTION_RELEASE_LIMIT,
      select: {
        externalId: true,
        tagName: true,
        name: true,
        repoFullName: true,
        publishedAt: true,
        url: true,
      },
    }),
    db.gitHubPullRequest.findMany({
      where: { userId, merged: true },
      orderBy: { mergedAt: "desc" },
      take: EXTRACTION_PR_LIMIT,
      select: {
        externalId: true,
        number: true,
        title: true,
        repoFullName: true,
        mergedAt: true,
        url: true,
      },
    }),
  ]);

  const inputs: CandidateInput[] = [];
  for (const r of releases) {
    inputs.push({
      sourceType: "github_release",
      sourceId: r.externalId,
      suggestedType: "repository",
      suggestedTitle: clampTitle(`Release ${r.name ?? r.tagName ?? ""} — ${r.repoFullName}`.trim()),
      suggestedDate: r.publishedAt,
      sourceUrl: r.url,
      repoFullName: r.repoFullName,
      confidence: "high", // a published release is an explicit, shipped artifact
      method: "github-release-v1",
      githubResourceType: "release",
      githubResourceId: r.externalId,
    });
  }
  for (const p of pulls) {
    inputs.push({
      sourceType: "github_pull_request",
      sourceId: String(p.number),
      suggestedType: "repository",
      suggestedTitle: clampTitle(
        p.title
          ? `Merged PR #${p.number}: ${p.title} — ${p.repoFullName}`
          : `Merged PR #${p.number} — ${p.repoFullName}`,
      ),
      suggestedDate: p.mergedAt,
      sourceUrl: p.url,
      repoFullName: p.repoFullName,
      confidence: "medium", // a merged PR is real work, but its impact is unstated
      method: "github-pull-request-v1",
      githubResourceType: "pull_request",
      githubResourceId: String(p.number),
    });
  }

  // Idempotent insert: skip any (sourceType, sourceId) that already exists in any status.
  const existing = await db.evidenceCandidate.findMany({
    where: { userId, OR: inputs.map((i) => ({ sourceType: i.sourceType, sourceId: i.sourceId })) },
    select: { sourceType: true, sourceId: true },
  });
  const seen = new Set(existing.map((e) => `${e.sourceType}:${e.sourceId}`));
  const toCreate = inputs.filter((i) => !seen.has(`${i.sourceType}:${i.sourceId}`));

  if (toCreate.length > 0) {
    await db.evidenceCandidate.createMany({
      data: toCreate.map((i): Prisma.EvidenceCandidateCreateManyInput => ({
        userId,
        sourceType: i.sourceType,
        sourceId: i.sourceId,
        suggestedType: i.suggestedType,
        suggestedTitle: i.suggestedTitle,
        suggestedDate: i.suggestedDate,
        sourceUrl: i.sourceUrl,
        repoFullName: i.repoFullName,
        confidence: i.confidence,
        method: i.method,
        githubResourceType: i.githubResourceType,
        githubResourceId: i.githubResourceId,
      })),
      skipDuplicates: true,
    });
  }
  return { scanned: inputs.length, created: toCreate.length };
}
