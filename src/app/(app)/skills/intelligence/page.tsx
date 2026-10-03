import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SkillIntelligenceView } from "@/components/skills/intelligence-view";

export const metadata: Metadata = { title: "Skill intelligence" };

export default function SkillIntelligencePage() {
  return (
    <>
      <PageHeader
        title="Skill intelligence"
        description="Evidence-derived levels, gaps to target, freshness and demonstration trends — computed live from your linked records."
      />
      <SkillIntelligenceView />
    </>
  );
}
