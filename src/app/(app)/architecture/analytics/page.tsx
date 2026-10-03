import type { Metadata } from "next";

import { ArchitectureAnalyticsView } from "@/components/architecture/architecture-lists";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Architecture analytics" };

export default function ArchitectureAnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Architecture analytics"
        description="Decision status, revisits, documentation gaps, project coverage and the component registry. Every number opens the records it counts."
      />
      <ArchitectureAnalyticsView />
    </>
  );
}
