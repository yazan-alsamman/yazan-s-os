import type { Metadata } from "next";

import { EvidenceDetail } from "@/components/records/details";

export const metadata: Metadata = { title: "Evidence" };

export default async function EvidenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <EvidenceDetail id={(await params).id} />;
}
