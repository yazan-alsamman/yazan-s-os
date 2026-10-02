import type { Metadata } from "next";

import { TechnologyDetail } from "@/components/records/details";

export const metadata: Metadata = { title: "Technology" };

export default async function TechnologyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <TechnologyDetail id={(await params).id} />;
}
