import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectsList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Project records with lifecycle, milestones, manual and computed health, skills, technologies and evidence. Open a project for its full engineering dossier."
      />
      <ProjectsList />
    </>
  );
}
