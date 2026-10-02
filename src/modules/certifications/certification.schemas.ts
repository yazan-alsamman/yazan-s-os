import { z } from "zod";

import { CertificationStatus } from "@/generated/prisma/enums";
import { paginationQuerySchema, searchTermSchema, sortSchema } from "@/lib/http/pagination";
import {
  datesOrdered,
  optionalHttpUrl,
  optionalIsoDate,
  optionalText,
  requiredText,
} from "@/modules/shared/fields";

export const certificationStatusSchema = z.enum(CertificationStatus);

/** Days before expiry at which a certification counts as "expiring" (Command Center attention). */
export const EXPIRING_WINDOW_DAYS = 90;

export const expiryStateSchema = z.enum(["valid", "expiring", "expired", "no_expiry"]);
export type ExpiryState = z.infer<typeof expiryStateSchema>;

export const certificationFields = {
  name: requiredText(200),
  issuer: requiredText(200),
  category: optionalText(80),
  issueDate: optionalIsoDate,
  expiryDate: optionalIsoDate,
  credentialId: optionalText(200),
  verificationUrl: optionalHttpUrl,
  status: certificationStatusSchema.optional(),
};

export const createCertificationSchema = z
  .object(certificationFields)
  .refine((v) => datesOrdered(v.issueDate, v.expiryDate), {
    message: "Expiry date must not be before the issue date",
    path: ["expiryDate"],
  });

export const updateCertificationSchema = z
  .object(certificationFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listCertificationsQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  status: certificationStatusSchema.optional(),
  issuer: z.string().trim().max(200).optional(),
  expiry: expiryStateSchema.optional(),
  sort: sortSchema(
    ["name", "issuer", "issueDate", "expiryDate", "updatedAt", "createdAt"],
    "-issueDate",
  ),
});

export type CreateCertificationInput = z.infer<typeof createCertificationSchema>;
export type UpdateCertificationInput = z.infer<typeof updateCertificationSchema>;
export type ListCertificationsQuery = z.infer<typeof listCertificationsQuerySchema>;

/** Derived expiry state (renewal status, 01 §7). Pure function of dates — never stored. */
export function expiryStateOf(expiryDate: Date | null, now: Date = new Date()): ExpiryState {
  if (!expiryDate) return "no_expiry";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expiry = expiryDate.getTime();
  if (expiry < today) return "expired";
  if (expiry <= today + EXPIRING_WINDOW_DAYS * 86_400_000) return "expiring";
  return "valid";
}
