import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PortfolioView } from "@/components/projects/portfolio";

export const metadata: Metadata = { title: "Project portfolio" };

export default function PortfolioPage() {
  return (
    <>
      <PageHeader
        title="Project portfolio"
        description="Lifecycle, manual and computed health, delivery, technology usage and evidence across all your projects — computed live from your records."
      />
      <PortfolioView />
    </>
  );
}
