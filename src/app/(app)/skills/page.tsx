import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SkillsList } from "@/components/records/lists";

export const metadata: Metadata = { title: "Skills" };

export default function SkillsPage() {
  return (
    <>
      <PageHeader
        title="Skills"
        description="Skills with target levels and linked evidence. Evidence-derived levels, gaps and freshness are under Intelligence."
      />
      <SkillsList />
    </>
  );
}
