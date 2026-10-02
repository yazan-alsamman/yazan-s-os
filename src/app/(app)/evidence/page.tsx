import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EvidenceList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Evidence Vault" };

export default function EvidencePage() {
  return (
    <>
      <PageHeader
        title="Evidence Vault"
        description="Professional evidence and where it came from. File uploads and portfolio export arrive in Phase 10."
      />
      <EvidenceList />
    </>
  );
}
