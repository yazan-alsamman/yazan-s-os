import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ImportCenter } from "@/components/records/imports";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import"
        description="Bring in existing records. Every imported record is reviewed before it becomes part of your data."
      />
      <ImportCenter />
    </>
  );
}
