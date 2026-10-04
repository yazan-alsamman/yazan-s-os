"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/http/fetch-json";

/**
 * Controlled GitHub → Evidence linking (Phase 10). Creates one evidence record from a synchronized
 * GitHub resource and opens it. Never automatic; the user clicks per resource. The new evidence is
 * unverified (pending review) and keeps its GitHub provenance.
 */
export function GithubEvidenceButton({
  resourceType,
  repoExternalId,
  resourceId,
  label = "Save as evidence",
  size = "sm",
}: {
  resourceType: "repository" | "pull_request" | "issue" | "release" | "commit";
  repoExternalId: string;
  resourceId: string;
  label?: string;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const mutation = useApiMutation<
    { resourceType: string; repoExternalId: string; resourceId: string },
    { data: { id: string } }
  >("POST", "/api/v1/evidence/from-github", ["evidence", "search"]);
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Button
        size={size}
        variant="outline"
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate(
            { resourceType, repoExternalId, resourceId },
            { onSuccess: (res) => router.push(`/evidence/${res.data.id}` as never) },
          )
        }
      >
        {mutation.isPending ? "Saving…" : label}
      </Button>
      {mutation.isError && (
        <span role="alert" className="text-caption text-danger">
          {errorMessage(mutation.error)}
        </span>
      )}
    </span>
  );
}
