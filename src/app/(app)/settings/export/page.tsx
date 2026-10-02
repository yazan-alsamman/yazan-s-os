import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ExportPanel } from "@/components/records/imports";

export const metadata: Metadata = { title: "Export" };

export default function ExportPage() {
  return (
    <>
      <PageHeader
        title="Export"
        description="Download your own data. Only your records are ever included."
      />
      <ExportPanel />
    </>
  );
}
