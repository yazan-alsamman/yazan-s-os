import type { Metadata } from "next";

import { EmailWorkspace } from "@/components/google/email";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Email" };
export const dynamic = "force-dynamic";

export default function EmailPage() {
  return (
    <>
      <PageHeader
        title="Email"
        description="Your Gmail — inbox, threads and search. Gmail stays the source of truth; HTML is sanitized, and nothing is sent, archived or modified except by your explicit action."
      />
      <EmailWorkspace />
    </>
  );
}
