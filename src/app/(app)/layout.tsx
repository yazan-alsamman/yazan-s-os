import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { requireAuthenticatedUser } from "@/lib/auth/session";

/**
 * Protected application boundary. Every page below this layout is rendered only after
 * the session is validated server-side against the database.
 */
export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}
