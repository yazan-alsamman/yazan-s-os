/**
 * Infrastructure health model.
 *
 * Component status: `healthy` | `unavailable` | `not_configured` (optional components only).
 * Overall status:
 *   - `unavailable` when a critical component (database) is unavailable
 *   - `degraded`    when a non-critical component (redis, storage) is unavailable
 *   - `healthy`     otherwise
 * Public output contains statuses only — no hostnames, versions, latencies or errors.
 */
export type ComponentStatus = "healthy" | "unavailable" | "not_configured";
export type OverallStatus = "healthy" | "degraded" | "unavailable";

export interface HealthProbe {
  name: string;
  critical: boolean;
  /** `null` means the component is optional and not configured. */
  check: (() => Promise<void>) | null;
}

export interface HealthReport {
  status: OverallStatus;
  checks: Record<string, ComponentStatus>;
  timestamp: string;
}

export const PROBE_TIMEOUT_MS = 2_000;

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function runHealthChecks(
  probes: HealthProbe[],
  options: {
    timeoutMs?: number;
    onFailure?: (name: string, error: unknown) => void;
    now?: () => Date;
  } = {},
): Promise<HealthReport> {
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;

  const results = await Promise.all(
    probes.map(async (probe): Promise<[HealthProbe, ComponentStatus]> => {
      if (!probe.check) return [probe, "not_configured"];
      try {
        await withTimeout(probe.check(), timeoutMs);
        return [probe, "healthy"];
      } catch (error) {
        options.onFailure?.(probe.name, error);
        return [probe, "unavailable"];
      }
    }),
  );

  const criticalDown = results.some(([p, s]) => p.critical && s === "unavailable");
  const anyDown = results.some(([, s]) => s === "unavailable");

  return {
    status: criticalDown ? "unavailable" : anyDown ? "degraded" : "healthy",
    checks: Object.fromEntries(results.map(([p, s]) => [p.name, s])),
    timestamp: (options.now?.() ?? new Date()).toISOString(),
  };
}
