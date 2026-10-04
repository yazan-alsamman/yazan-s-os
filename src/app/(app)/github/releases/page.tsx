import type { Metadata } from "next";

import { GitHubReleases } from "@/components/github/releases";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "GitHub releases" };
export const dynamic = "force-dynamic";

export default function GitHubReleasesPage() {
  return (
    <>
      <PageHeader
        title="Releases"
        description="Release intelligence from synchronized GitHub data: release count, stable vs pre-release split, repository coverage, latest release, trend and per-repository breakdown. Releases are explicit GitHub objects — never inferred from commits or tags."
      />
      <GitHubReleases />
    </>
  );
}
