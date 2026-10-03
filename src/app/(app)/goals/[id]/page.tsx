import type { Metadata } from "next";

import { GoalDossier } from "@/components/goals/goal-dossier";

export const metadata: Metadata = { title: "Goal" };

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <GoalDossier id={(await params).id} />;
}
