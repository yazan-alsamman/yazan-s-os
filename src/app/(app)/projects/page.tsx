import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectsList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Project records with lifecycle, skills, technologies and evidence. Health scoring and portfolio analytics arrive in Phase 3."
      />
      <ProjectsList />
    </>
  );
}
