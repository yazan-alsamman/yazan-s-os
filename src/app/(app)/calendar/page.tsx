import type { Metadata } from "next";

import { CalendarWorkspace } from "@/components/google/calendar";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Your Google Calendar across day, week and month. Create, update and cancel events — each only by your explicit confirmation. Google Calendar stays the source of truth."
      />
      <CalendarWorkspace />
    </>
  );
}
