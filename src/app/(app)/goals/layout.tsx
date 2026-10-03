import type { ReactNode } from "react";

import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  { href: "/goals", label: "Goals", exact: true },
  { href: "/goals/roadmap", label: "Roadmap" },
  { href: "/goals/analytics", label: "Analytics" },
];

export default function GoalsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs label="Goals and roadmap" tabs={TABS} />
      {children}
    </>
  );
}
