import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createCalendarService } from "@/modules/integrations/google/calendar.service";
export const dynamic = "force-dynamic";
/** GET /api/v1/calendar/calendars — the account's calendars. */
export const GET = defineUserRoute(
  "v1.calendar.calendars",
  async ({ ctx }) => ({ data: await createCalendarService(getDb()).listCalendars(ctx) }),
  { rateLimit: RateLimits.integration },
);
