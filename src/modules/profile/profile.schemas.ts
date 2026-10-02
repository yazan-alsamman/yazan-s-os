import { z } from "zod";

import {
  optionalHttpUrl,
  optionalLongText,
  optionalText,
  requiredText,
} from "@/modules/shared/fields";

/** IANA time zone identifier supported by the runtime (e.g. "Europe/Istanbul", "UTC"). */
export const timezoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone");

/** BCP 47 language tag (e.g. "en", "ar", "en-GB"). */
export const localeSchema = z
  .string()
  .trim()
  .max(35)
  .refine((tag) => {
    try {
      return Intl.getCanonicalLocales(tag).length === 1;
    } catch {
      return false;
    }
  }, "Unknown locale");

/**
 * Profile update. Identity fields (name, timezone, locale) live on User; the rest on Profile
 * (spec 04). Every field is optional so partial updates are possible.
 */
export const updateProfileSchema = z
  .object({
    name: requiredText(120),
    timezone: timezoneSchema,
    locale: localeSchema,
    headline: optionalText(200),
    summary: optionalLongText(5_000),
    location: optionalText(120),
    website: optionalHttpUrl,
    professionalObjective: optionalLongText(2_000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
