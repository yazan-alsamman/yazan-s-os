import type { Metadata } from "next";

import { MetricCatalogueView } from "@/components/command-center/metric-catalogue-view";

export const metadata: Metadata = { title: "Metric definitions" };

export default function MetricsPage() {
  return <MetricCatalogueView />;
}
