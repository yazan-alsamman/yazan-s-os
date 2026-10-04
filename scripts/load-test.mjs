// PEOS bounded load test (Phase 12, ADR 0058). Dependency-free: uses Node's global fetch and a
// fixed-concurrency worker pool. Intended for an ISOLATED environment (never production) — the
// deployment runbook forbids stress-testing production. Reports p50/p95/p99, throughput and error
// rate per target path. Does not fabricate: every number comes from measured request timings.
//
// Usage:
//   BASE=http://localhost:3100 N=500 CONCURRENCY=20 PATHS=/api/health COOKIE="..." \
//     node scripts/load-test.mjs
const BASE = process.env.BASE ?? "http://localhost:3100";
const N = Number(process.env.N ?? 500);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);
const PATHS = (process.env.PATHS ?? "/api/health").split(",").map((p) => p.trim());
const COOKIE = process.env.COOKIE ?? "";

const headers = COOKIE ? { cookie: COOKIE } : {};

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function run(path) {
  const url = `${BASE}${path}`;
  const latencies = [];
  let errors = 0;
  let next = 0;
  const started = performance.now();

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= N) return;
      const t0 = performance.now();
      try {
        const res = await fetch(url, { headers, redirect: "manual" });
        // Drain the body so the connection is reusable and timing includes transfer.
        await res.arrayBuffer();
        const dt = performance.now() - t0;
        if (res.status >= 500) errors++;
        else latencies.push(dt);
      } catch {
        errors++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const wall = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const r = (x) => Math.round(x * 10) / 10;
  return {
    path,
    requests: N,
    concurrency: CONCURRENCY,
    ok: latencies.length,
    errors,
    errorRate: r((errors / N) * 100),
    throughputRps: r(N / wall),
    p50ms: r(percentile(latencies, 50)),
    p95ms: r(percentile(latencies, 95)),
    p99ms: r(percentile(latencies, 99)),
    wallSeconds: r(wall),
  };
}

const results = [];
for (const path of PATHS) {
  // Small warm-up so JIT / connection pools are primed before measuring.
  await fetch(`${BASE}${path}`, { headers })
    .then((r) => r.arrayBuffer())
    .catch(() => {});
  results.push(await run(path));
}
process.stdout.write(
  `${JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2)}\n`,
);
