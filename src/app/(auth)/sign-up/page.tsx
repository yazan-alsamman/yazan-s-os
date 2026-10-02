import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/config/env";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

/** Account creation exists only while AUTH_ALLOW_SIGNUP=true (the server enforces this too). */
export default async function SignUpPage() {
  if (!getServerEnv().AUTH_ALLOW_SIGNUP) notFound();
  if (await getCurrentSession()) redirect("/command-center");

  return (
    <>
      <h1 className="text-h1 font-semibold tracking-tight">Create account</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        PEOS is private. Disable sign-up again once your account exists.
      </p>
      <SignUpForm />
      <p className="mt-6 text-center text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
