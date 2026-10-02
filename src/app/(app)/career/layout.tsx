import type { ReactNode } from "react";

import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  {
    href: "/career/profile",
    label: "Profile",
  },
  {
    href: "/career/experience",
    label: "Experience",
  },
  {
    href: "/career/education",
    label: "Education",
  },
];

export default function CareerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs label="Career Intelligence" tabs={TABS} />
      {children}
    </>
  );
}
