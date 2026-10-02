"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/http/fetch-json";

/** Skeleton rows matching the list layout (02 §8 "Loading"). */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2 p-4">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/** Human-readable error + retry (02 §8 "Error"). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-6">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle aria-hidden className="size-4 text-danger" />
        Could not load this data.
      </p>
      <p className="text-muted-foreground">{errorMessage(error)}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
