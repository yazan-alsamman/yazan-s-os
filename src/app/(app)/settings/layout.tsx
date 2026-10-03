import type { ReactNode } from "react";

import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  {
    href: "/settings",
    label: "Account",
    exact: true,
  },
  {
    href: "/settings/import",
    label: "Import",
  },
  {
    href: "/settings/export",
    label: "Export",
  },
  {
    href: "/settings/integrations",
    label: "Integrations",
  },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs label="Settings" tabs={TABS} />
      {children}
    </>
  );
}
