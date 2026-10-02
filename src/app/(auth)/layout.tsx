import type { ReactNode } from "react";

import { Brand } from "@/components/shell/sidebar";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-8">
        <Brand />
      </div>
      <main className="w-full max-w-sm rounded-lg border bg-surface p-6 shadow-sm">{children}</main>
      <p className="mt-6 text-caption text-muted-foreground">Personal Engineering OS · private</p>
    </div>
  );
}
