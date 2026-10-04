import type { EvidenceType, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { auditInTx } from "@/modules/shared/audit";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { toEvidenceDetailDto } from "./evidence.repository";
import { evidenceDetailInclude } from "./evidence.repository";
import type { GithubEvidenceInput } from "./evidence.schemas";

/** The real GitHub object a piece of evidence will cite (read from the Phase 9.x projections). */
interface ResolvedResource {
  title: string;
  sourceUrl: string | null;
  date: Date | null;
  defaultType: EvidenceType;
}

/**
 * Controlled GitHub → Evidence linking (Phase 10, ADR 0056). Reads the owner's synchronized GitHub
 * projection for the chosen resource and creates ONE evidence record that cites it, preserving
 * provenance (resource type + provider id + URL + date). Never automatic, never fabricated: if the
 * resource is not in the owner's synchronized data, nothing is created.
 */
export function createGithubEvidenceService(db: PrismaClient) {
  async function resolve(userId: string, input: GithubEvidenceInput): Promise<ResolvedResource> {
    const { repoExternalId, resourceId } = input;
    switch (input.resourceType) {
      case "repository": {
        const repo = await db.integrationExternalResource.findFirst({
          where: { userId, provider: "github", resourceType: "repository", externalId: resourceId },
          select: { displayName: true, url: true, metadata: true },
        });
        if (!repo) return notFound();
        const meta = repo.metadata as { pushedDate?: string | null } | null;
        return {
          title: `Repository: ${repo.displayName}`,
          sourceUrl: repo.url,
          date: meta?.pushedDate ? new Date(meta.pushedDate) : null,
          defaultType: "repository",
        };
      }
      case "pull_request": {
        const number = Number(resourceId);
        if (!Number.isInteger(number)) return notFound();
        const pr = await db.gitHubPullRequest.findFirst({
          where: { userId, repoExternalId, number },
          select: { title: true, url: true, repoFullName: true, mergedAt: true, ghCreatedAt: true },
        });
        if (!pr) return notFound();
        return {
          title: pr.title ? `PR: ${pr.title}` : `Pull request #${number} (${pr.repoFullName})`,
          sourceUrl: pr.url,
          date: pr.mergedAt ?? pr.ghCreatedAt,
          defaultType: "repository",
        };
      }
      case "issue": {
        const number = Number(resourceId);
        if (!Number.isInteger(number)) return notFound();
        const issue = await db.gitHubIssue.findFirst({
          where: { userId, repoExternalId, number },
          select: { title: true, url: true, repoFullName: true, ghCreatedAt: true },
        });
        if (!issue) return notFound();
        return {
          title: issue.title ? `Issue: ${issue.title}` : `Issue #${number} (${issue.repoFullName})`,
          sourceUrl: issue.url,
          date: issue.ghCreatedAt,
          defaultType: "other",
        };
      }
      case "release": {
        const rel = await db.gitHubRelease.findFirst({
          where: { userId, repoExternalId, externalId: resourceId },
          select: { name: true, tagName: true, url: true, repoFullName: true, publishedAt: true },
        });
        if (!rel) return notFound();
        return {
          title: `Release: ${rel.name ?? rel.tagName ?? "release"} (${rel.repoFullName})`,
          sourceUrl: rel.url,
          date: rel.publishedAt,
          defaultType: "other",
        };
      }
      case "commit": {
        const commit = await db.gitHubCommit.findFirst({
          where: { userId, repoExternalId, sha: resourceId },
          select: { message: true, url: true, repoFullName: true, authoredAt: true },
        });
        if (!commit) return notFound();
        const subject = (commit.message ?? "").split("\n")[0]!.slice(0, 120);
        return {
          title: `Commit: ${subject || resourceId.slice(0, 10)} (${commit.repoFullName})`,
          sourceUrl: commit.url,
          date: commit.authoredAt,
          defaultType: "repository",
        };
      }
    }
  }

  return {
    create(ctx: ServiceContext, input: GithubEvidenceInput) {
      return db.$transaction(async (tx) => {
        // Read must be inside the owner scope; a resource the user hasn't synchronized is "not found".
        const resolved = await resolve(ctx.userId, input);
        const created = await tx.evidence.create({
          data: {
            userId: ctx.userId,
            type: input.type ?? resolved.defaultType,
            title: input.title ?? resolved.title,
            sourceUrl: resolved.sourceUrl,
            date: resolved.date,
            verified: false, // GitHub-derived evidence starts unverified (pending review)
            origin: "manual",
            githubResourceType: input.resourceType,
            githubResourceId: input.resourceId,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "evidence",
          verb: "created",
          entityId: created.id,
          after: {
            title: created.title,
            githubResourceType: created.githubResourceType,
            githubResourceId: created.githubResourceId,
          },
        });
        const detail = await tx.evidence.findFirst({
          where: { id: created.id, userId: ctx.userId },
          include: evidenceDetailInclude,
        });
        return toEvidenceDetailDto(requireFound(detail));
      });
    },
  };
}

function notFound(): never {
  throw new AppError("NOT_FOUND", {
    message: "That GitHub resource was not found in your synchronized data.",
  });
}
