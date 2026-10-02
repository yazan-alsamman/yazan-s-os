import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionUnavailable } from "@/components/layout/section-unavailable";
import { findSection, NAV_SECTIONS } from "@/components/shell/navigation";

interface Props {
  params: Promise<{ section: string }>;
}

/** Route boundary for every planned section in the navigation registry. */
function resolvePlannedSection(id: string) {
  const section = findSection(id);
  return section?.availability === "planned" && section.href === `/${id}` ? section : undefined;
}

/** Only registered planned sections exist; anything else is a real HTTP 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return NAV_SECTIONS.filter((s) => s.availability === "planned" && s.id !== "command-center").map(
    (s) => ({ section: s.id }),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const section = resolvePlannedSection((await params).section);
  return { title: section?.label ?? "Not found" };
}

export default async function PlannedSectionPage({ params }: Props) {
  const section = resolvePlannedSection((await params).section);
  if (!section) notFound();
  return <SectionUnavailable section={section} />;
}
