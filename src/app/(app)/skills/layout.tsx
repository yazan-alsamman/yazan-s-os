import type { ReactNode } from "react";

import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  {
    href: "/skills",
    label: "Skills",
    exact: true,
  },
  {
    href: "/skills/intelligence",
    label: "Intelligence",
  },
  {
    href: "/skills/graph",
    label: "Career graph",
  },
  {
    href: "/skills/technologies",
    label: "Technologies",
  },
  {
    href: "/skills/level-models",
    label: "Level models",
  },
];

export default function SkillsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs label="Skills and technologies" tabs={TABS} />
      {children}
    </>
  );
}
