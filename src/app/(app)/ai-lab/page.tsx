import type { Metadata } from "next";

import { ExperimentsList } from "@/components/experiments/experiments-list";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "AI Lab" };

export default function AiLabPage() {
  return (
    <>
      <PageHeader
        title="AI Lab"
        description="An engineering record of your AI/ML experiments: hypotheses, runs, recorded evaluation metrics and comparisons. PEOS stores what you record — it never executes models or fabricates results."
      />
      <ExperimentsList />
    </>
  );
}
