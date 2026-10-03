import type { Metadata } from "next";

import { CopilotWorkspace } from "@/components/copilot/copilot-workspace";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "AI Copilot" };

export default function CopilotPage() {
  return (
    <>
      <PageHeader
        title="AI Copilot"
        description="Ask about your projects, skills, evidence, goals, experiments and architecture decisions. Answers are built from your PEOS records and cite them — facts, derived metrics and interpretation are labelled, and missing data is called out rather than guessed."
      />
      <CopilotWorkspace />
    </>
  );
}
