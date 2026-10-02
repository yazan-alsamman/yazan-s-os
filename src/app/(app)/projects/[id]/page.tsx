import type { Metadata } from "next";

import { ProjectDetail } from "@/components/records/details";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <ProjectDetail id={(await params).id} />;
}
