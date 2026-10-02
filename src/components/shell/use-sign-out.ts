"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { authClient } from "@/lib/auth/auth-client";

/** Revoke the server session, then return to the sign-in page. */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = useCallback(async () => {
    setPending(true);
    try {
      await authClient.signOut();
    } finally {
      router.replace("/sign-in");
      router.refresh();
    }
  }, [router]);

  return { signOut, pending };
}
