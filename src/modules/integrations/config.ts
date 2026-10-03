import "server-only";

import type { IntegrationProvider } from "@/generated/prisma/enums";
import { getServerEnv } from "@/lib/config/env";

import { isEncryptionConfigured } from "./crypto";

/** Server-only OAuth client configuration. Secrets never leave this layer (ADR 0052/0053). */
export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function providerClient(provider: IntegrationProvider): OAuthClientConfig | null {
  const env = getServerEnv();
  if (!isEncryptionConfigured()) return null;
  if (provider === "github") {
    if (
      env.GITHUB_INTEGRATION_CLIENT_ID &&
      env.GITHUB_INTEGRATION_CLIENT_SECRET &&
      env.GITHUB_INTEGRATION_REDIRECT_URI
    ) {
      return {
        clientId: env.GITHUB_INTEGRATION_CLIENT_ID,
        clientSecret: env.GITHUB_INTEGRATION_CLIENT_SECRET,
        redirectUri: env.GITHUB_INTEGRATION_REDIRECT_URI,
      };
    }
    return null;
  }
  if (provider === "google") {
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI) {
      return {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.GOOGLE_REDIRECT_URI,
      };
    }
    return null;
  }
  return null;
}

/** Whether a provider can actually be connected (client configured AND encryption key present). */
export function isProviderConfigured(provider: IntegrationProvider): boolean {
  return providerClient(provider) !== null;
}
