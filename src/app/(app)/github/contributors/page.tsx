import type { Metadata } from "next";

import { GitHubContributors } from "@/components/github/contributors";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "GitHub contributors" };
export const dynamic = "force-dynamic";

export default function GitHubContributorsPage() {
  return (
    <>
      <PageHeader
        title="Contributors"
        description="Contributor intelligence from synchronized GitHub data: distinct contributors, per-repository breakdown and GitHub's own contribution attribution. Contributions are transparent evidence — never a ranking or quality score."
      />
      <GitHubContributors />
    </>
  );
}
