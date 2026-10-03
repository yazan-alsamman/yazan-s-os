import type { Metadata } from "next";
import { Suspense } from "react";

import { IntegrationsPanel } from "@/components/integrations/integrations-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default function IntegrationsSettingsPage() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect external systems to PEOS. External providers remain the source of truth; PEOS stores connection metadata, encrypted tokens (server-side only), sync state, provenance and the links you create. Everything is owner-scoped and audited."
      />
      <Suspense fallback={null}>
        <IntegrationsPanel />
      </Suspense>
    </>
  );
}
