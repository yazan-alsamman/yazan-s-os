import type { Metadata } from "next";

import { ArchitectureMapView } from "@/components/architecture/architecture-map";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Architecture map" };

export default function MapPage() {
  return (
    <>
      <PageHeader
        title="Architecture map"
        description="Components and the dependencies you recorded, as a bounded graph with a table alternative. Select a component to open it."
      />
      <ArchitectureMapView />
    </>
  );
}
