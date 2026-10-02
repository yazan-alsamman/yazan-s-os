import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { Metadata } from "next";

import { CommandCenter } from "@/components/command-center/command-center";
import { runHealthChecks, type ComponentStatus } from "@/lib/health/health-service";
import { infrastructureProbes } from "@/lib/health/infrastructure-probes";
import { logger } from "@/lib/observability/logger";

export const metadata: Metadata = { title: "Command Center" };

const STATUS_PRESENTATION: Record<
  ComponentStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  healthy: { label: "Healthy", icon: CheckCircle2, className: "text-success" },
  unavailable: { label: "Unavailable", icon: XCircle, className: "text-danger" },
  not_configured: {
    label: "Not configured",
    icon: CircleDashed,
    className: "text-muted-foreground",
  },
};

export default async function CommandCenterPage() {
  const health = await runHealthChecks(infrastructureProbes(), {
    onFailure: (component, error) => logger.warn({ component, err: error }, "health.check_failed"),
  });

  return (
    <div className="flex flex-col gap-6">
      <CommandCenter />

      <details className="rounded-lg border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-body font-medium">
          System status <span className="text-muted-foreground">— {health.status}</span>
        </summary>
        <ul className="divide-y border-t">
          {Object.entries(health.checks).map(([component, status]) => {
            const { label, icon: Icon, className } = STATUS_PRESENTATION[status];
            return (
              <li key={component} className="flex items-center justify-between px-4 py-2.5">
                <span className="capitalize">{component}</span>
                <span className={`flex items-center gap-1.5 ${className}`}>
                  <Icon aria-hidden className="size-4" />
                  <span className="text-body">{label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
