import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectHealthList } from "@/components/projects/health-list";

export const metadata: Metadata = { title: "Computed project health" };

export default function ProjectHealthPage() {
  return (
    <>
      <PageHeader
        title="Computed project health"
        description="The computed health signal for every project, beside your manual assessment. Open a project to see how its score was calculated."
      />
      <ProjectHealthList />
    </>
  );
}
