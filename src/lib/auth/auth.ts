import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { getServerEnv } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { logger } from "@/lib/observability/logger";
import { createAuditRepository } from "@/modules/audit/audit.repository";
import { AuditAction, createAuditService } from "@/modules/audit/audit.service";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password-policy";

function buildAuth() {
  const env = getServerEnv();
  const db = getDb();
  const audit = createAuditService({ repository: createAuditRepository(db), logger });

  const github =
    env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.AUTH_GITHUB_CLIENT_ID,
            clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
            disableSignUp: !env.AUTH_ALLOW_SIGNUP,
          },
        }
      : undefined;

  return betterAuth({
    appName: "PEOS",
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: prismaAdapter(db, { provider: "postgresql" }),

    emailAndPassword: {
      enabled: true,
      disableSignUp: !env.AUTH_ALLOW_SIGNUP,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      // No transactional email provider exists yet (ADR 0004); verification is deferred.
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
    },
    ...(github ? { socialProviders: github } : {}),

    user: {
      additionalFields: {
        timezone: { type: "string", required: false, defaultValue: "UTC", input: false },
        locale: { type: "string", required: false, defaultValue: "en", input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // rotate expiry daily while active
      freshAge: 60 * 15, // sensitive actions require a session younger than 15 min
    },

    rateLimit: {
      enabled: env.NODE_ENV !== "test" && !env.AUTH_RATE_LIMIT_DISABLED,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },

    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: env.APP_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },

    telemetry: { enabled: false },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await audit.record({
              actorId: user.id,
              action: AuditAction.UserCreated,
              entityType: "user",
              entityId: user.id,
            });
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await audit.record({
              actorId: session.userId,
              action: AuditAction.SessionCreated,
              entityType: "session",
              entityId: session.id,
              after: { userAgent: session.userAgent ?? null },
            });
          },
        },
        delete: {
          after: async (session) => {
            await audit.record({
              actorId: session.userId,
              action: AuditAction.SessionRevoked,
              entityType: "session",
              entityId: session.id,
            });
          },
        },
      },
    },

    // nextCookies must be last: it lets server actions set auth cookies.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

const globalForAuth = globalThis as unknown as { peosAuth?: Auth };

/** Lazily constructed so that `next build` does not require runtime secrets. */
export function getAuth(): Auth {
  globalForAuth.peosAuth ??= buildAuth();
  return globalForAuth.peosAuth;
}

export function isGithubSignInEnabled(): boolean {
  const env = getServerEnv();
  return Boolean(env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET);
}
