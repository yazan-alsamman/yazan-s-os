import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { CertificationsList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Certifications" };

export default function CertificationsPage() {
  return (
    <>
      <PageHeader
        title="Certifications"
        description="Credentials with verification links and expiry tracking. Certifications are evidence, not proof of production proficiency."
      />
      <CertificationsList />
    </>
  );
}
