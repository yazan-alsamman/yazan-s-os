import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EvidenceList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Evidence Vault" };

export default function EvidencePage() {
  return (
    <>
      <PageHeader
        title="Evidence Vault"
        description="Professional evidence and where it came from — linked to skills, projects, certifications, experience and the opportunities it supports. Capture evidence from synchronized GitHub resources with provenance; export an opportunity's evidence as a portfolio. Files are referenced by URL."
      />
      <EvidenceList />
    </>
  );
}
