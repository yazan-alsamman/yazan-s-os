"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

import { signUpSchema, type SignUpValues } from "../credentials-schema";
import { FormField } from "../form-field";

export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signUp.email(values);
    if (error) {
      setFormError(
        error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "The account could not be created. Check your details and try again.",
      );
      return;
    }
    router.replace("/command-center");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        id="name"
        label="Name"
        autoComplete="name"
        error={errors.name}
        {...register("name")}
      />
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
        label={`Password (min. ${MIN_PASSWORD_LENGTH} characters)`}
        type="password"
        autoComplete="new-password"
        error={errors.password}
        {...register("password")}
      />
      {formError && (
        <p role="alert" className="text-body text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
