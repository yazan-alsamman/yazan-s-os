import type { Metadata } from "next";

import { GitHubExplorer } from "@/components/integrations/github-explorer";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "GitHub" };
export const dynamic = "force-dynamic";

export default function GitHubPage() {
  return (
    <>
      <PageHeader
        title="GitHub"
        description="Repositories for your connected GitHub account. GitHub remains the source of truth; freshness is shown and no data appears until you connect."
      />
      <GitHubExplorer />
    </>
  );
}
