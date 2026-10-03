import type { Metadata } from "next";

import { GoalsAnalyticsView } from "@/components/goals/goals-list";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Goal analytics" };

export default function GoalAnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Goal analytics"
        description="Status, risk, completion, target attainment and deadline load across your goals. Every number opens the goals it counts."
      />
      <GoalsAnalyticsView />
    </>
  );
}
