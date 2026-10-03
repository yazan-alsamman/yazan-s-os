import { z } from "zod";

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const optionalUrl = optionalString.pipe(z.url().optional());

/**
 * Server environment contract. Parsed at startup (src/instrumentation.ts) and lazily on
 * first use. There are no silent fallbacks for security-critical values.
 */
export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url({ protocol: /^https?$/ }),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters of random data"),
    AUTH_ALLOW_SIGNUP: booleanString.default(false),
    /**
     * Disables Better Auth rate limiting. Only accepted when APP_URL is a loopback host
     * (local E2E runs); rejected for any reachable deployment.
     */
    AUTH_RATE_LIMIT_DISABLED: booleanString.default(false),
    AUTH_GITHUB_CLIENT_ID: optionalString,
    AUTH_GITHUB_CLIENT_SECRET: optionalString,

    S3_ENDPOINT: optionalUrl,
    S3_REGION: optionalString,
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: booleanString.default(false),

    OTEL_SERVICE_NAME: z.string().default("peos"),
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,

    /**
     * AI Copilot model provider (Phase 8, ADR 0047). "none" (default) = retrieval-only mode: the
     * Copilot answers with cited records and never synthesizes. Server-only; never sent to the
     * browser.
     */
    AI_PROVIDER: z.enum(["none", "openai_compatible"]).default("none"),
    AI_BASE_URL: optionalUrl,
    AI_MODEL: optionalString,
    AI_API_KEY: optionalString,
    AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),

    // ── Integration platform (Phase 9.5, ADR 0052) ────────────────
    // Base64-encoded 32-byte key (AES-256-GCM) for encrypting provider tokens at rest. Required
    // once any OAuth connector is configured; without it, connecting fails safely.
    INTEGRATION_ENCRYPTION_KEY: optionalString,
    GITHUB_INTEGRATION_CLIENT_ID: optionalString,
    GITHUB_INTEGRATION_CLIENT_SECRET: optionalString,
    GITHUB_INTEGRATION_REDIRECT_URI: optionalUrl,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_REDIRECT_URI: optionalUrl,
  })
  .superRefine((env, ctx) => {
    const github = [env.AUTH_GITHUB_CLIENT_ID, env.AUTH_GITHUB_CLIENT_SECRET];
    if (github.some(Boolean) && !github.every(Boolean)) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_GITHUB_CLIENT_ID"],
        message: "AUTH_GITHUB_CLIENT_ID and AUTH_GITHUB_CLIENT_SECRET must be set together",
      });
    }

    const s3 = [env.S3_BUCKET, env.S3_REGION, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY];
    if (s3.some(Boolean) && !s3.every(Boolean)) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_BUCKET"],
        message:
          "Object storage is partially configured: set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY together, or none of them",
      });
    }

    if (env.AUTH_RATE_LIMIT_DISABLED) {
      const host = new URL(env.APP_URL).hostname;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_RATE_LIMIT_DISABLED"],
          message: "Rate limiting can only be disabled when APP_URL is a loopback host",
        });
      }
    }

    if (env.AI_PROVIDER === "openai_compatible" && (!env.AI_BASE_URL || !env.AI_MODEL)) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_PROVIDER"],
        message: "AI_PROVIDER=openai_compatible needs AI_BASE_URL and AI_MODEL",
      });
    }

    // Integration connectors: a client id/secret/redirect come as a set, and any configured
    // connector requires the encryption key (tokens are never stored in plaintext).
    const ghInt = [
      env.GITHUB_INTEGRATION_CLIENT_ID,
      env.GITHUB_INTEGRATION_CLIENT_SECRET,
      env.GITHUB_INTEGRATION_REDIRECT_URI,
    ];
    if (ghInt.some(Boolean) && !ghInt.every(Boolean)) {
      ctx.addIssue({
        code: "custom",
        path: ["GITHUB_INTEGRATION_CLIENT_ID"],
        message:
          "GitHub integration needs GITHUB_INTEGRATION_CLIENT_ID, GITHUB_INTEGRATION_CLIENT_SECRET and GITHUB_INTEGRATION_REDIRECT_URI together",
      });
    }
    const google = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI];
    if (google.some(Boolean) && !google.every(Boolean)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message:
          "Google integration needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI together",
      });
    }
    if ((ghInt.every(Boolean) || google.every(Boolean)) && !env.INTEGRATION_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["INTEGRATION_ENCRYPTION_KEY"],
        message: "A configured integration connector requires INTEGRATION_ENCRYPTION_KEY",
      });
    }
    if (env.INTEGRATION_ENCRYPTION_KEY) {
      let bytes = 0;
      try {
        bytes = Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, "base64").length;
      } catch {
        bytes = 0;
      }
      if (bytes !== 32) {
        ctx.addIssue({
          code: "custom",
          path: ["INTEGRATION_ENCRYPTION_KEY"],
          message: "INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key (AES-256)",
        });
      }
    }

    if (env.NODE_ENV === "production" && !env.APP_URL.startsWith("https://")) {
      const host = new URL(env.APP_URL).hostname;
      if (host !== "localhost" && host !== "127.0.0.1") {
        ctx.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: "APP_URL must use https in production (secure cookies depend on it)",
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid server environment configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "InvalidEnvironmentError";
  }
}

/** Parse an env record. Error messages name variables only — never their values. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** True when all object-storage variables are present. */
export function isStorageConfigured(env: ServerEnv): boolean {
  return Boolean(
    env.S3_BUCKET && env.S3_REGION && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY,
  );
}
