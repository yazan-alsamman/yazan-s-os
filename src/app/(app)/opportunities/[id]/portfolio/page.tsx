import type { Metadata } from "next";

import { OpportunityPortfolio } from "@/components/opportunities/portfolio";

export const metadata: Metadata = { title: "Evidence portfolio" };
export const dynamic = "force-dynamic";

export default async function OpportunityPortfolioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OpportunityPortfolio id={(await params).id} />;
}
