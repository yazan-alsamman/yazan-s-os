import type { ReactNode } from "react";

import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  { href: "/ai-lab", label: "Experiments", exact: true },
  { href: "/ai-lab/analytics", label: "Analytics" },
];

export default function AiLabLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs label="AI Lab" tabs={TABS} />
      {children}
    </>
  );
}
