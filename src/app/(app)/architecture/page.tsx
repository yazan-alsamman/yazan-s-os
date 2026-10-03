import type { Metadata } from "next";

import { DecisionsList } from "@/components/architecture/architecture-lists";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Architecture decisions" };

export default function ArchitecturePage() {
  return (
    <>
      <PageHeader
        title="Architecture decisions"
        description="Your architecture decision records: context, options, decision, consequences and revisit dates, linked to projects, components and evidence. Superseded decisions stay as history."
      />
      <DecisionsList />
    </>
  );
}
