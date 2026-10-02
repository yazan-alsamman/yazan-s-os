import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ExperiencesList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Experience" };

export default function ExperiencePage() {
  return (
    <>
      <PageHeader
        title="Experience"
        description="Positions held, with achievements and linked evidence."
      />
      <ExperiencesList />
    </>
  );
}
