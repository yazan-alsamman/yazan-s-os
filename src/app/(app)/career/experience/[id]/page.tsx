import type { Metadata } from "next";

import { ExperienceDetail } from "@/components/records/details";

export const metadata: Metadata = { title: "Experience" };

export default async function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ExperienceDetail id={(await params).id} />;
}
