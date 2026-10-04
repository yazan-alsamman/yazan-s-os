import type { Metadata } from "next";

import { OpportunityDossier } from "@/components/opportunities/opportunity-dossier";

export const metadata: Metadata = { title: "Opportunity" };
export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <OpportunityDossier id={(await params).id} />;
}
