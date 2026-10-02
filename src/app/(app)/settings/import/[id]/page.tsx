import type { Metadata } from "next";

import { BackLink } from "@/components/data/detail";
import { PageHeader } from "@/components/layout/page-header";
import { ImportReview } from "@/components/records/imports";

export const metadata: Metadata = { title: "Import review" };

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <BackLink href="/settings/import" label="All imports" />
      <PageHeader
        title="Review import"
        description="Accept, update or reject each record. Matches with existing records are never overwritten without your decision."
      />
      <ImportReview jobId={(await params).id} />
    </>
  );
}
