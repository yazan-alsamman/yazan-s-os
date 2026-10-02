import { Construction } from "lucide-react";

import type { NavSection } from "@/components/shell/navigation";

import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/** Honest placeholder for sections that have no functionality yet. Shows no records. */
export function SectionUnavailable({ section }: { section: NavSection }) {
  return (
    <>
      <PageHeader title={section.label} description={section.summary} />
      <EmptyState icon={Construction} title="Not available yet">
        <p>
          This section has not been built. It contains no data and no actions — nothing here is
          simulated.
        </p>
        <p>
          <span className="font-medium text-foreground">Planned: </span>
          {section.plannedIn}
        </p>
      </EmptyState>
    </>
  );
}
