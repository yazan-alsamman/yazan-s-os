import type { Metadata } from "next";

import { SkillDetail } from "@/components/records/details";

export const metadata: Metadata = { title: "Skill" };

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <SkillDetail id={(await params).id} />;
}
