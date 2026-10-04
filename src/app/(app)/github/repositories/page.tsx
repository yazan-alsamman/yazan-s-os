import type { Metadata } from "next";
import { Suspense } from "react";

import { GitHubRepositories } from "@/components/github/repositories";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "GitHub repositories" };
export const dynamic = "force-dynamic";

export default function GitHubRepositoriesPage() {
  return (
    <>
      <PageHeader
        title="Repositories"
        description="All repositories accessible to your GitHub account. Search, filter and sort; open one for its commits, activity, languages and PEOS project links."
      />
      <Suspense fallback={null}>
        <GitHubRepositories />
      </Suspense>
    </>
  );
}
