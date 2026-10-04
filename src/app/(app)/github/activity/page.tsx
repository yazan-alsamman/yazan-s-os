import type { Metadata } from "next";

import { GitHubActivity } from "@/components/github/activity";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "GitHub activity" };
export const dynamic = "force-dynamic";

export default function GitHubActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="A unified GitHub activity timeline (commits, pull requests, issues and releases), a daily commit heatmap, commit distributions and your own account activity. All timestamps are aggregated in UTC; the heatmap measures daily commits only — activity types are never blended into one score."
      />
      <GitHubActivity />
    </>
  );
}
