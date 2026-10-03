import type { Metadata } from "next";

import { ExperimentDossier } from "@/components/experiments/experiment-dossier";

export const metadata: Metadata = { title: "Experiment" };

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  return <ExperimentDossier id={(await params).id} />;
}
