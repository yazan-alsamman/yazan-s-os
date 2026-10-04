import type { Metadata } from "next";

import { GitHubCompare } from "@/components/github/compare";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Compare GitHub repositories" };
export const dynamic = "force-dynamic";

export default function GitHubComparePage() {
  return (
    <>
      <PageHeader
        title="Compare repositories"
        description="Compare up to six repositories side by side on independent metrics — commits, active days, pull requests, issues, releases, contributors and code size. Each metric stands alone; PEOS never combines them into a single repository score."
      />
      <GitHubCompare />
    </>
  );
}
