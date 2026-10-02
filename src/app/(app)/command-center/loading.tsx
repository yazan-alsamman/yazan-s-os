import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Command Center (its status panel waits on infrastructure probes).
 * Kept at the leaf segment: a group-level loading.tsx would start streaming before
 * `notFound()` and turn real 404s into HTTP 200.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
