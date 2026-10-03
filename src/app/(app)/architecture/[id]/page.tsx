import type { Metadata } from "next";

import { DecisionDossier } from "@/components/architecture/decision-dossier";

export const metadata: Metadata = { title: "Architecture decision" };

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  return <DecisionDossier id={(await params).id} />;
}
