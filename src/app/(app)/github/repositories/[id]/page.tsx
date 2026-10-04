import type { Metadata } from "next";

import { GithubEvidenceButton } from "@/components/github/github-evidence-button";
import { GitHubLanguages } from "@/components/github/languages";
import { GitHubRepository } from "@/components/integrations/github-repository";

export const metadata: Metadata = { title: "Repository" };
export const dynamic = "force-dynamic";

export default async function GitHubRepositoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <GitHubRepository id={id} backHref="/github/repositories" />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-3">
        <span className="text-caption text-muted-foreground">
          Capture this repository as professional evidence (kept with its GitHub provenance, pending
          your review):
        </span>
        <GithubEvidenceButton
          resourceType="repository"
          repoExternalId={id}
          resourceId={id}
          label="Save repository as evidence"
        />
      </div>
      <GitHubLanguages id={id} />
    </div>
  );
}
