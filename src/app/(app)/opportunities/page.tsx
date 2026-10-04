import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { OpportunitiesList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Opportunities" };
export const dynamic = "force-dynamic";

export default function OpportunitiesPage() {
  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Track professional opportunities — roles, consulting, speaking, partnerships — with structured requirements and a transparent evidence-to-requirement fit. PEOS shows what your evidence supports and what is still missing; it never invents listings, matches or a fit score."
      />
      <OpportunitiesList />
    </>
  );
}
