import "server-only";

import type { IntegrationProvider } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";

import type { OAuthClientConfig } from "./config";
import { getProviderDefinition } from "./providers";

/**
 * Generic OAuth 2.0 authorization-code helpers (Phase 9.5, ADR 0053). Authorize URLs and token
 * endpoints come from the trusted provider registry — never from user input (SSRF defence). The
 * token exchange uses an injectable fetch so it is unit-tested without the network.
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
  scope: string[];
}

export function buildAuthorizeUrl(
  provider: IntegrationProvider,
  config: OAuthClientConfig,
  state: string,
  scopes: string[],
): string {
  const def = getProviderDefinition(provider);
  if (!def) throw new AppError("INTEGRATION_NOT_CONFIGURED");
  const url = new URL(def.authorizeEndpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }
  return url.toString();
}

const toScopes = (scope: unknown): string[] =>
  typeof scope === "string" && scope.trim() ? scope.trim().split(/[,\s]+/) : [];

export async function exchangeCodeForToken(
  provider: IntegrationProvider,
  config: OAuthClientConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  const def = getProviderDefinition(provider);
  if (!def) throw new AppError("INTEGRATION_NOT_CONFIGURED");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  let response: Response;
  try {
    response = await fetchImpl(def.tokenEndpoint, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    throw new AppError("INTEGRATION_PROVIDER_UNAVAILABLE");
  }
  if (!response.ok) throw new AppError("INTEGRATION_AUTH_FAILED");
  let json: {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
    error?: unknown;
  };
  try {
    json = (await response.json()) as typeof json;
  } catch {
    throw new AppError("INTEGRATION_AUTH_FAILED");
  }
  if (json.error || typeof json.access_token !== "string" || !json.access_token) {
    throw new AppError("INTEGRATION_AUTH_FAILED");
  }
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresInSeconds:
      typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : null,
    scope: toScopes(json.scope),
  };
}
