import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ProfileEditor } from "@/components/records/profile-editor";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profile"
        description="Your professional identity. Career analysis (skill gaps, career graph) arrives in Phase 4."
      />
      <ProfileEditor />
    </>
  );
}
