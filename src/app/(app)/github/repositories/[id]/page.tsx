import type { Metadata } from "next";

import { GitHubLanguages } from "@/components/github/languages";
import { GitHubRepository } from "@/components/integrations/github-repository";

export const metadata: Metadata = { title: "Repository" };
export const dynamic = "force-dynamic";

export default async function GitHubRepositoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <GitHubRepository id={id} backHref="/github/repositories" />
      <GitHubLanguages id={id} />
    </div>
  );
}
