import type { ReactNode } from "react";

import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  { href: "/projects", label: "Projects", exact: true },
  { href: "/projects/portfolio", label: "Portfolio" },
  { href: "/projects/milestones", label: "Milestones" },
  { href: "/projects/health", label: "Computed health" },
];

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs label="Projects" tabs={TABS} />
      {children}
    </>
  );
}
