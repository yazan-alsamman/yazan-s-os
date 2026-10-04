"use client";

import { useRecordRecentView } from "@/lib/ux/hooks";

/**
 * Records a visit to an entity for the owner's recently-viewed list (Phase 11). Renders nothing;
 * dropped into a detail view once the entity has loaded (so the title is known).
 */
export function RecordRecentView(props: { type: string; id: string; title: string; href: string }) {
  useRecordRecentView(props);
  return null;
}
