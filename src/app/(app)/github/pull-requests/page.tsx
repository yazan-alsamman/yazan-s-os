import type { Metadata } from "next";

import { GitHubPullRequests } from "@/components/github/pull-requests";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "GitHub pull requests" };
export const dynamic = "force-dynamic";

export default function GitHubPullRequestsPage() {
  return (
    <>
      <PageHeader
        title="Pull Requests"
        description="Pull-request intelligence from synchronized GitHub data: opened, merged and open counts, merge rate, median time-to-merge, trend and per-repository breakdown. Lifecycle values are GitHub's own — never fabricated."
      />
      <GitHubPullRequests />
    </>
  );
}
