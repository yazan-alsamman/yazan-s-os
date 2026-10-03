import type { Metadata } from "next";

import { RoadmapView } from "@/components/goals/roadmap";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage() {
  return (
    <>
      <PageHeader
        title="Roadmap"
        description="Your goals over time: a quarter timeline, a quarter board, the goal tree and dependencies — built only from recorded dates and links."
      />
      <RoadmapView />
    </>
  );
}
