import { NextResponse } from "next/server";

import { runHealthChecks } from "@/lib/health/health-service";
import { infrastructureProbes } from "@/lib/health/infrastructure-probes";
import { defineRoute } from "@/lib/http/route-handler";

export const dynamic = "force-dynamic";

/**
 * Public infrastructure health. Returns statuses only; failure details go to the
 * server log. HTTP 503 only when the application cannot serve requests.
 */
export const GET = defineRoute("health", async ({ log }) => {
  const report = await runHealthChecks(infrastructureProbes(), {
    onFailure: (component, error) => log.warn({ component, err: error }, "health.check_failed"),
  });
  return NextResponse.json(report, { status: report.status === "unavailable" ? 503 : 200 });
});
