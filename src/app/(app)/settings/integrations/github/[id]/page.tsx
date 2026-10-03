import type { Metadata } from "next";

import { GitHubRepository } from "@/components/integrations/github-repository";

export const metadata: Metadata = { title: "Repository" };
export const dynamic = "force-dynamic";

export default async function RepositoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GitHubRepository id={id} />;
}
