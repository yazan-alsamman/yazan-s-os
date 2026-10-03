import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { LevelModelsView } from "@/components/skills/level-models";

export const metadata: Metadata = { title: "Skill level models" };

export default function LevelModelsPage() {
  return (
    <>
      <PageHeader
        title="Skill level models"
        description="The default 0–5 scale and your own names and descriptions for it."
      />
      <LevelModelsView />
    </>
  );
}
