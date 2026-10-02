/**
 * Content-Security-Policy builder (ADR 0009 / docs/architecture/security-baseline.md).
 *
 * Scripts: nonce + 'strict-dynamic' — Next.js applies the nonce to its own scripts.
 * Documented exceptions:
 *  - style-src 'unsafe-inline': Radix UI and next/font emit inline style attributes.
 *  - 'unsafe-eval' and ws: in development only (React Refresh / HMR).
 */
export function buildContentSecurityPolicy(options: {
  nonce: string;
  isDev: boolean;
  isHttps: boolean;
}): string {
  const { nonce, isDev, isHttps } = options;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (isHttps) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
