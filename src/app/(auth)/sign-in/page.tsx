import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isGithubSignInEnabled } from "@/lib/auth/auth";
import { getCurrentSession } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/config/env";

import { safeRedirectPath } from "../credentials-schema";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const redirectTo = safeRedirectPath((await searchParams).next);
  if (await getCurrentSession()) redirect(redirectTo);

  const signUpEnabled = getServerEnv().AUTH_ALLOW_SIGNUP;

  return (
    <>
      <h1 className="text-h1 font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Access your Personal Engineering OS.</p>
      <SignInForm redirectTo={redirectTo} githubEnabled={isGithubSignInEnabled()} />
      {signUpEnabled && (
        <p className="mt-6 text-center text-muted-foreground">
          No account yet?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      )}
    </>
  );
}
