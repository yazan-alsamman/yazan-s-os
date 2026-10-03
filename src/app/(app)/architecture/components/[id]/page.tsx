import type { Metadata } from "next";

import { ComponentDossier } from "@/components/architecture/component-dossier";

export const metadata: Metadata = { title: "Architecture component" };

export default async function ComponentPage({ params }: { params: Promise<{ id: string }> }) {
  return <ComponentDossier id={(await params).id} />;
}
