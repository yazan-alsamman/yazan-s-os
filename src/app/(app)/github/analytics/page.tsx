import type { Metadata } from "next";

import { GitHubAnalytics } from "@/components/github/analytics";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "GitHub analytics" };
export const dynamic = "force-dynamic";

export default function GitHubAnalyticsPage() {
  return (
    <>
      <PageHeader
        title="GitHub Analytics"
        description="Cross-repository analytics from synchronized GitHub data: commit trend, commits by repository, language and activity distributions, and transparent rankings. Observed activity only — never a combined repository score."
      />
      <GitHubAnalytics />
    </>
  );
}
