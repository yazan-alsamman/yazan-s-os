import { getDb } from "@/lib/db/client";
import { parseBody, parseQuery } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createCalendarService } from "@/modules/integrations/google/calendar.service";
import { eventBodySchema, listEventsQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET events in a time range; POST create an event (confirm:true, explicit). */
export const GET = defineUserRoute(
  "v1.calendar.events",
  async ({ request, ctx }) => ({
    data: await createCalendarService(getDb()).listEvents(
      ctx,
      parseQuery(request, listEventsQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
export const POST = defineUserRoute(
  "v1.calendar.event.create",
  async ({ request, ctx }) => {
    const b = await parseBody(request, eventBodySchema);
    return created(
      await createCalendarService(getDb()).createEvent(ctx, b.calendarId, {
        summary: b.summary,
        description: b.description,
        start: b.start,
        end: b.end,
        timeZone: b.timeZone,
        location: b.location,
        attendees: b.attendees,
      }),
    );
  },
  { rateLimit: RateLimits.integration },
);
