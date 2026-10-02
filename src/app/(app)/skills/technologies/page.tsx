import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { TechnologiesList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Technologies" };

export default function TechnologiesPage() {
  return (
    <>
      <PageHeader
        title="Technologies"
        description="Languages, frameworks, platforms and tools, and the projects that use them."
      />
      <TechnologiesList />
    </>
  );
}
