import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";

import { AccountPanel } from "./account-panel";
import { AppearancePanel } from "./appearance-panel";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Account and appearance. Manage external connections under Integrations."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <AccountPanel />
        <AppearancePanel />
      </div>
    </>
  );
}
