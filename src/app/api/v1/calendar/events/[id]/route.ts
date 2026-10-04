import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { parseBody, parseQuery } from "@/lib/http/params";
import { noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createCalendarService } from "@/modules/integrations/google/calendar.service";
import { cancelEventSchema, eventBodySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
interface P {
  id: string;
}
const calQuery = z.object({ calendarId: z.string().trim().min(1).max(256).default("primary") });

/** GET one event (?calendarId=). */
export const GET = defineUserRoute<P>(
  "v1.calendar.event",
  async ({ request, params, ctx }) => ({
    data: await createCalendarService(getDb()).getEvent(
      ctx,
      parseQuery(request, calQuery).calendarId,
      params.id,
    ),
  }),
  { rateLimit: RateLimits.integration },
);

/** PATCH — update an event (confirm:true, explicit). */
export const PATCH = defineUserRoute<P>(
  "v1.calendar.event.update",
  async ({ request, params, ctx }) => {
    const b = await parseBody(request, eventBodySchema);
    return {
      data: await createCalendarService(getDb()).updateEvent(ctx, b.calendarId, params.id, {
        summary: b.summary,
        description: b.description,
        start: b.start,
        end: b.end,
        timeZone: b.timeZone,
        location: b.location,
        attendees: b.attendees,
      }),
    };
  },
  { rateLimit: RateLimits.integration },
);

/** DELETE — cancel an event (confirm:true, explicit). */
export const DELETE = defineUserRoute<P>(
  "v1.calendar.event.cancel",
  async ({ request, params, ctx }) => {
    const b = await parseBody(request, cancelEventSchema);
    await createCalendarService(getDb()).cancelEvent(ctx, b.calendarId, params.id);
    return noContent();
  },
  { rateLimit: RateLimits.integration },
);
