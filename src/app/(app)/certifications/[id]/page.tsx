import type { Metadata } from "next";

import { CertificationDetail } from "@/components/records/details";

export const metadata: Metadata = { title: "Certification" };

export default async function CertificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CertificationDetail id={(await params).id} />;
}
