import type { IntegrationProvider } from "@/generated/prisma/enums";

/**
 * Provenance (Phase 9.5, ADR 0052). Every externally sourced record carries where it came from and
 * when it was observed/synced, with a stable provider-native reference. External ids are never
 * fabricated — they come from the provider payload.
 */
export interface Provenance {
  sourceProvider: IntegrationProvider;
  resourceType: string;
  externalId: string;
  /** Stable reference, e.g. `github:repository:123456`. */
  externalRef: string;
  sourceUrl: string | null;
  observedAt: string;
  lastSyncedAt: string;
}

export function externalRef(
  provider: IntegrationProvider,
  resourceType: string,
  externalId: string,
): string {
  return `${provider}:${resourceType}:${externalId}`;
}

export function provenanceOf(input: {
  provider: IntegrationProvider;
  resourceType: string;
  externalId: string;
  sourceUrl?: string | null;
  observedAt: Date;
  lastSyncedAt: Date;
}): Provenance {
  return {
    sourceProvider: input.provider,
    resourceType: input.resourceType,
    externalId: input.externalId,
    externalRef: externalRef(input.provider, input.resourceType, input.externalId),
    sourceUrl: input.sourceUrl ?? null,
    observedAt: input.observedAt.toISOString(),
    lastSyncedAt: input.lastSyncedAt.toISOString(),
  };
}
