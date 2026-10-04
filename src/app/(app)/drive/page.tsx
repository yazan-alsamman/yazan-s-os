import type { Metadata } from "next";

import { DriveWorkspace } from "@/components/google/drive";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Drive" };
export const dynamic = "force-dynamic";

export default function DrivePage() {
  return (
    <>
      <PageHeader
        title="Drive"
        description="Browse your Google Drive — My Drive, folders, recent and shared files. PEOS shows metadata only and opens files in Google Drive, which remains the source of truth."
      />
      <DriveWorkspace />
    </>
  );
}
