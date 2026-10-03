import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { CareerGraphView } from "@/components/skills/career-graph";

export const metadata: Metadata = { title: "Career graph" };

export default function CareerGraphPage() {
  return (
    <>
      <PageHeader
        title="Career graph"
        description="How your skills, projects, technologies, certifications, experiences and evidence connect — real records and recorded relationships only."
      />
      <CareerGraphView />
    </>
  );
}
