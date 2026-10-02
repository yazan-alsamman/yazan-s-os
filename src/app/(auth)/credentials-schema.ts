import { z } from "zod";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
export function safeRedirectPath(next: string | null | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    return next;
  }
  return "/command-center";
}
