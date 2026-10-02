import type { ReactNode } from "react";

import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  {
    href: "/skills",
    label: "Skills",
    exact: true,
  },
  {
    href: "/skills/technologies",
    label: "Technologies",
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
