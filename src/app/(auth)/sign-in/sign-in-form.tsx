"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

import { signInSchema, type SignInValues } from "../credentials-schema";
import { FormField } from "../form-field";

export function SignInForm({
  redirectTo,
  githubEnabled,
}: {
  redirectTo: string;
  githubEnabled: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signIn.email(values);
    if (error) {
      // Same message for unknown email and wrong password (no account enumeration).
      setFormError(
        error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "Email or password is incorrect.",
      );
      return;
    }
    router.replace(redirectTo);
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email}
          {...register("email")}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
          {...register("password")}
        />
        {formError && (
          <p role="alert" className="text-body text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {githubEnabled && (
        <Button
          variant="outline"
          onClick={() =>
            void authClient.signIn.social({ provider: "github", callbackURL: redirectTo })
          }
        >
          Continue with GitHub
        </Button>
      )}
    </div>
  );
}
