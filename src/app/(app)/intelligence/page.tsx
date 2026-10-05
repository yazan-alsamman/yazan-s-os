import type { Metadata } from "next";

import { IntelligenceCenter } from "@/components/intelligence/intelligence-center";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Intelligence" };
export const dynamic = "force-dynamic";

export default function IntelligencePage() {
  return (
    <>
      <PageHeader
        title="Continuous Intelligence"
        description="Grounded signals from your real PEOS data: evidence candidates, skill freshness, opportunity gaps and a weekly executive review. Every signal traces to source records; nothing is AI-invented, and no consequential action happens without your decision."
      />
      <IntelligenceCenter />
    </>
  );
}
