import type { Metadata } from "next";

import { ExperimentsAnalyticsView } from "@/components/experiments/experiments-list";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "AI Lab analytics" };

export default function AiLabAnalyticsPage() {
  return (
    <>
      <PageHeader
        title="AI Lab analytics"
        description="Status, decisions, reproducibility and evaluation coverage across your experiments. Every count opens the experiments it represents; recorded cost, latency and token summaries are descriptive, over real values only."
      />
      <ExperimentsAnalyticsView />
    </>
  );
}
