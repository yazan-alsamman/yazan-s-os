import type { NextConfig } from "next";

/**
 * Static security headers for every response. The Content-Security-Policy is per-request
 * (nonce-based) and set in src/proxy.ts.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

// HSTS only for production builds; browsers ignore it over plain HTTP anyway.
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep native/worker-thread based server libraries out of the bundle.
  serverExternalPackages: ["pino", "bullmq", "ioredis", "@prisma/client", "pg"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
