import type { IntegrationProvider } from "@/generated/prisma/enums";

/**
 * The connector registry (Phase 9.5, ADR 0052) — provider-neutral, non-secret definitions. Adding a
 * connector means adding an entry here plus an adapter; the Integration Hub needs no redesign.
 * `status: "available"` is implemented this phase; `"scaffolded"` is wired at the architecture
 * boundary and deferred (no adapter/UI yet).
 */
export interface ScopeDef {
  scope: string;
  purpose: string;
  /** Whether the scope grants write access (least-privilege documentation). */
  write: boolean;
}

export interface ProviderDefinition {
  provider: IntegrationProvider;
  displayName: string;
  authType: "oauth2";
  status: "available" | "scaffolded";
  scopes: ScopeDef[];
  resources: string[];
  /** Provider mutations implemented this phase (none yet — read-only). */
  mutations: string[];
  authorizeEndpoint: string;
  tokenEndpoint: string;
  /** Endpoint that returns the authenticated account identity. */
  identityEndpoint: string;
  accountUrl: string;
}

export const PROVIDERS: Record<IntegrationProvider, ProviderDefinition> = {
  github: {
    provider: "github",
    displayName: "GitHub",
    authType: "oauth2",
    status: "available",
    scopes: [
      {
        scope: "read:user",
        purpose: "Read the authenticated GitHub account identity.",
        write: false,
      },
      {
        scope: "repo",
        purpose:
          "Read repositories (including private) and their commits and activity. The minimum classic scope that can read private repositories; PEOS only reads.",
        write: true,
      },
    ],
    resources: ["repositories", "commits", "activity"],
    mutations: [],
    authorizeEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    identityEndpoint: "https://api.github.com/user",
    accountUrl: "https://github.com",
  },
  google: {
    provider: "google",
    displayName: "Google",
    authType: "oauth2",
    status: "scaffolded",
    scopes: [
      { scope: "openid", purpose: "Account identity.", write: false },
      { scope: "email", purpose: "Account email.", write: false },
      {
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        purpose: "Read Gmail messages (deferred).",
        write: false,
      },
      {
        scope: "https://www.googleapis.com/auth/drive.readonly",
        purpose: "Read Drive file metadata (deferred).",
        write: false,
      },
      {
        scope: "https://www.googleapis.com/auth/calendar",
        purpose: "Read and manage Calendar events (deferred).",
        write: true,
      },
    ],
    resources: ["gmail", "drive", "calendar"],
    mutations: [],
    authorizeEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    identityEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    accountUrl: "https://myaccount.google.com",
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

export function getProviderDefinition(provider: string): ProviderDefinition | null {
  return (PROVIDERS as Record<string, ProviderDefinition>)[provider] ?? null;
}
