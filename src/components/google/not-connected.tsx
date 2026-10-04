"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/http/fetch-json";

/** Renders the right state for a Google query error, or null to fall through to content. */
export function GoogleError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}): ReactNode {
  if (error instanceof ApiError && error.body?.code === "INTEGRATION_NOT_CONNECTED") {
    return (
      <div className="rounded-lg border border-dashed bg-surface p-6 text-center">
        <h2 className="text-h3 font-semibold">Google is not connected.</h2>
        <p className="mx-auto mt-1 max-w-prose text-muted-foreground">
          Connect your Google account to use this. No data is shown until you connect.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/settings/integrations">Connect Google</Link>
        </Button>
      </div>
    );
  }
  if (error instanceof ApiError && error.body?.code === "INTEGRATION_RATE_LIMITED") {
    return (
      <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
        Google is rate-limiting requests. Try again shortly.
      </p>
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}
