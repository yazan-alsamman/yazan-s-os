import type { Metadata } from "next";

import { ComponentsList } from "@/components/architecture/architecture-lists";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Architecture components" };

export default function ComponentsPage() {
  return (
    <>
      <PageHeader
        title="Component registry"
        description="The services, databases, queues, external APIs, AI models and infrastructure of your systems, with their projects, technologies, dependencies and governing decisions."
      />
      <ComponentsList />
    </>
  );
}
