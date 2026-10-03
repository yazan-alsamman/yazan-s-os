import type { Metadata } from "next";

import { GoalsList } from "@/components/goals/goals-list";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <>
      <PageHeader
        title="Goals"
        description="North Stars, annual objectives and quarterly goals with their targets, milestones, projects and skills. Risk and attainment are derived from linked records; open a goal for its dossier."
      />
      <GoalsList />
    </>
  );
}
