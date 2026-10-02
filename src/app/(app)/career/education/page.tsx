import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EducationList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Education" };

export default function EducationPage() {
  return (
    <>
      <PageHeader title="Education" description="Degrees and programmes of study." />
      <EducationList />
    </>
  );
}
