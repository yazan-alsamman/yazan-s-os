import type { Metadata } from "next";

import { GitHubOverview } from "@/components/github/overview";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "GitHub" };
export const dynamic = "force-dynamic";

export default function GitHubPage() {
  return (
    <>
      <PageHeader
        title="GitHub"
        description="Engineering intelligence over your connected GitHub account — repositories, commit volume and cadence, activity and languages. Built from synchronized GitHub data (run Sync to refresh); observed activity, never a productivity score. GitHub remains the source of truth."
      />
      <GitHubOverview />
    </>
  );
}
