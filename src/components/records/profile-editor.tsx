"use client";

import { useState } from "react";

import { Panel, ProvenancePanel } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { EntityForm, type FieldDescriptor } from "@/components/forms/entity-form";
import { useApiItem, useApiMutation } from "@/lib/api/hooks";
import type { ProfileDto } from "@/modules/profile/profile.service";

const PROFILE_FIELDS: readonly FieldDescriptor[] = [
  {
    name: "name",
    label: "Name",
    kind: "text",
    required: true,
    maxLength: 120,
    autoComplete: "name",
  },
  { name: "headline", label: "Headline", kind: "text", maxLength: 200 },
  { name: "location", label: "Location", kind: "text", maxLength: 120 },
  { name: "website", label: "Website", kind: "url", autoComplete: "url" },
  {
    name: "timezone",
    label: "Time zone",
    kind: "text",
    required: true,
    maxLength: 64,
    description: "IANA name, e.g. Europe/Istanbul or UTC.",
  },
  {
    name: "locale",
    label: "Locale",
    kind: "text",
    required: true,
    maxLength: 35,
    description: "e.g. en, ar, en-GB.",
  },
  { name: "summary", label: "Summary", kind: "textarea", maxLength: 5_000 },
  {
    name: "professionalObjective",
    label: "Professional objective",
    kind: "textarea",
    maxLength: 2_000,
  },
];

/** The caller's own profile (spec 04 Profile + User identity fields). */
export function ProfileEditor() {
  const profile = useApiItem<ProfileDto>("profile", "/api/v1/profile");
  const save = useApiMutation<Record<string, unknown>>("PATCH", "/api/v1/profile", ["profile"]);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  if (profile.isPending) return <ListSkeleton rows={6} />;
  if (profile.isError)
    return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;

  const data = profile.data;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Panel title="Professional profile">
          {!data.exists && (
            <p className="mb-4 rounded-md border border-dashed px-3 py-2 text-muted-foreground">
              No profile yet. Fill it in here, or import it from Settings → Import (LinkedIn
              Profile.csv or a PEOS JSON file). Nothing is pre-filled.
            </p>
          )}
          <EntityForm
            key={data.updatedAt ?? "new"}
            fields={PROFILE_FIELDS}
            initial={data}
            submitLabel="Save profile"
            onSubmit={async (payload) => {
              setSavedAt(null);
              await save.mutateAsync(payload);
              setSavedAt(new Date().toLocaleTimeString());
            }}
          />
          <p role="status" aria-live="polite" className="mt-2 text-caption text-success">
            {savedAt ? `Saved at ${savedAt}.` : ""}
          </p>
        </Panel>
      </div>
      <div className="flex flex-col gap-4">
        <Panel title="Account">
          <p className="text-muted-foreground">Signed in as</p>
          <p className="font-medium break-all">{data.email}</p>
        </Panel>
        <ProvenancePanel provenance={data.provenance} />
      </div>
    </div>
  );
}
