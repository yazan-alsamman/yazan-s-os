import type { Metadata } from "next";

import { EngineeringAnalyticsView } from "@/components/analytics/engineering-analytics";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Engineering Analytics" };

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Engineering Analytics"
        description="Recorded engineering activity across all domains over time — project and milestone completions, evidence, goals, architecture decisions, experiment runs and certifications. Counts are built only from the dates you recorded (never time spent, never inferred history, no score), with comparison periods and drill-down to the records behind each number."
      />
      <EngineeringAnalyticsView />
    </>
  );
}
