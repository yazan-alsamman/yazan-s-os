import type { Metadata } from "next";

import { GitHubIssues } from "@/components/github/issues";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "GitHub issues" };
export const dynamic = "force-dynamic";

export default function GitHubIssuesPage() {
  return (
    <>
      <PageHeader
        title="Issues"
        description="Issue intelligence from synchronized GitHub data: opened, closed and open counts, closure rate, trend, top labels and per-repository breakdown. Pull requests are excluded so issues are never double-counted."
      />
      <GitHubIssues />
    </>
  );
}
