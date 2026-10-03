import type { ReactNode } from "react";

import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  { href: "/architecture", label: "Decisions", exact: true },
  { href: "/architecture/components", label: "Components" },
  { href: "/architecture/map", label: "Map" },
  { href: "/architecture/analytics", label: "Analytics" },
];

export default function ArchitectureLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs label="Architecture" tabs={TABS} />
      {children}
    </>
  );
}
