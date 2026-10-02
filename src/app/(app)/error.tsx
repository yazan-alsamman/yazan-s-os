"use client";

import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

/** Route-level error boundary: human-readable message + retry (spec 02 §8 "Error"). */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert">
      <EmptyState icon={AlertTriangle} title="Something went wrong">
        <p>
          This page could not be displayed. You can try again; if it keeps failing, check the server
          logs.
        </p>
        {error.digest && <p className="font-mono text-caption">Reference: {error.digest}</p>}
        <div>
          <Button variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
        </div>
      </EmptyState>
    </div>
  );
}
