import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { METRIC_CATALOGUE } from "@/modules/analytics/metric-catalogue";

export const dynamic = "force-dynamic";

/** GET /api/v1/analytics/metrics — the metric catalogue (read-only, includes unavailable metrics). */
export const GET = defineUserRoute(
  "v1.analytics.metrics",
  async () => ({ data: METRIC_CATALOGUE }),
  { rateLimit: RateLimits.analytics },
);
