import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { MilestonesList } from "@/components/projects/milestones";

export const metadata: Metadata = { title: "Milestones" };

export default function MilestonesPage() {
  return (
    <>
      <PageHeader
        title="Milestones"
        description="Milestones across all projects. Overdue = open and planned before today (UTC), in a project that is not archived."
      />
      <MilestonesList />
    </>
  );
}
