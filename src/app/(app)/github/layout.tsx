import type { ReactNode } from "react";

import { GithubNav } from "@/components/github/common";

/** GitHub product-area shell (Phase 9.7): the section sub-navigation above every GitHub page. */
export default function GitHubLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <GithubNav />
      {children}
    </div>
  );
}
