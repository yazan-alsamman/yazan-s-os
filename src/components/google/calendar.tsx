"use client";

import { useState } from "react";

import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { errorMessage } from "@/lib/http/fetch-json";

import { GoogleError } from "./not-connected";
import {
  useCalendars,
  useCancelEvent,
  useCreateEvent,
  useEvents,
  type CalendarEvent,
} from "./use-google";

type Preset = "today" | "week" | "month";
function range(preset: Preset): { timeMin: string; timeMax: string; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { timeMin: start.toISOString(), timeMax: end.toISOString(), label: "Today" };
  }
  if (preset === "week") {
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { timeMin: start.toISOString(), timeMax: end.toISOString(), label: "Next 7 days" };
  }
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { timeMin: mStart.toISOString(), timeMax: mEnd.toISOString(), label: "This month" };
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString();
const timeOf = (e: CalendarEvent) =>
  e.allDay
    ? "All day"
    : e.start
      ? new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

function NewEvent({ calendarId, onDone }: { calendarId: string; onDone: () => void }) {
  const create = useCreateEvent();
  const [summary, setSummary] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [attendees, setAttendees] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function confirmCreate() {
    await create.mutateAsync({
      calendarId,
      summary,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      location: location || undefined,
      attendees: attendees
        ? attendees
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    });
    onDone();
  }

  const valid = summary && start && end && new Date(end) > new Date(start);
  return (
    <section aria-label="New event" className="rounded-lg border bg-surface p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="e-sum" className="text-caption text-muted-foreground">
            Title
          </label>
          <Input id="e-sum" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="e-start" className="text-caption text-muted-foreground">
            Start
          </label>
          <Input
            id="e-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="e-end" className="text-caption text-muted-foreground">
            End
          </label>
          <Input
            id="e-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="e-loc" className="text-caption text-muted-foreground">
            Location
          </label>
          <Input id="e-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="e-att" className="text-caption text-muted-foreground">
            Attendees (comma-separated)
          </label>
          <Input id="e-att" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
        </div>
      </div>
      {confirming ? (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-caption">
          <p className="font-medium">Create this event on Google Calendar?</p>
          <p className="text-muted-foreground">
            “{summary}” · {new Date(start).toLocaleString()} → {new Date(end).toLocaleString()}
            {attendees && ` · invites ${attendees}`}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={confirmCreate} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Confirm create"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => setConfirming(true)} disabled={!valid}>
            Review &amp; create
          </Button>
          <Button size="sm" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </div>
      )}
      {create.isError && (
        <p role="alert" className="mt-2 text-caption text-danger">
          {errorMessage(create.error)}
        </p>
      )}
    </section>
  );
}

function EventDetail({ e, onCancelled }: { e: CalendarEvent; onCancelled: () => void }) {
  const cancel = useCancelEvent();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{e.summary}</h3>
        {e.status === "cancelled" && <Badge tone="neutral">Cancelled</Badge>}
      </div>
      <p className="text-caption text-muted-foreground">
        {e.start ? new Date(e.start).toLocaleString() : ""} →{" "}
        {e.end ? new Date(e.end).toLocaleString() : ""}
        {e.allDay ? " (all day)" : ""}
      </p>
      {e.location && <p className="text-caption">📍 {e.location}</p>}
      {e.organizer && (
        <p className="text-caption text-muted-foreground">Organizer: {e.organizer}</p>
      )}
      {e.attendees.length > 0 && (
        <p className="text-caption text-muted-foreground">
          Attendees: {e.attendees.map((a) => `${a.email} (${a.status})`).join(", ")}
        </p>
      )}
      {e.url && (
        <a
          href={e.url}
          target="_blank"
          rel="noreferrer"
          className="text-caption underline underline-offset-4"
        >
          Open in Google Calendar
        </a>
      )}
      <p className="mt-1 text-caption text-muted-foreground">
        Source: Google Calendar · calendar:event:{e.externalId}
      </p>
      <div className="mt-2">
        {confirming ? (
          <span className="flex items-center gap-2 text-caption">
            Cancel this event on Google Calendar?
            <Button
              size="xs"
              variant="destructive"
              onClick={async () => {
                await cancel.mutateAsync({ id: e.externalId, calendarId: e.calendarId });
                onCancelled();
              }}
              disabled={cancel.isPending}
            >
              Confirm cancel
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="xs" variant="outline" onClick={() => setConfirming(true)}>
            Cancel event
          </Button>
        )}
      </div>
    </div>
  );
}

export function CalendarWorkspace() {
  const [preset, setPreset] = useState<Preset>("week");
  const [calendarId, setCalendarId] = useState("primary");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const calendars = useCalendars();
  const r = range(preset);
  const events = useEvents({ calendarId, timeMin: r.timeMin, timeMax: r.timeMax, maxResults: 100 });

  if (events.isError)
    return <GoogleError error={events.error} onRetry={() => void events.refetch()} />;

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events.data?.data ?? []) {
    if (!e.start) continue;
    const k = dayKey(e.start);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-3">
        {(["today", "week", "month"] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={preset === p ? "default" : "outline"}
            onClick={() => setPreset(p)}
          >
            {p === "today" ? "Today" : p === "week" ? "Week" : "Month"}
          </Button>
        ))}
        <NativeSelect
          aria-label="Calendar"
          value={calendarId}
          onChange={(e) => setCalendarId(e.target.value)}
          className="ml-2"
        >
          <option value="primary">Primary</option>
          {(calendars.data ?? [])
            .filter((c) => !c.primary)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.summary}
              </option>
            ))}
        </NativeSelect>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          New event
        </Button>
      </div>

      {creating && <NewEvent calendarId={calendarId} onDone={() => setCreating(false)} />}
      {selected && <EventDetail e={selected} onCancelled={() => setSelected(null)} />}

      {events.isPending ? (
        <ListSkeleton rows={6} />
      ) : (events.data?.data.length ?? 0) === 0 ? (
        <p className="p-4 text-muted-foreground">No events in {r.label.toLowerCase()}.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {[...byDay.entries()].map(([day, evs]) => (
            <section key={day} aria-label={day}>
              <h3 className="mb-1 text-caption font-semibold text-muted-foreground">{day}</h3>
              <ul className="divide-y rounded-lg border">
                {evs.map((e) => (
                  <li key={e.externalId}>
                    <button
                      type="button"
                      onClick={() => setSelected(e)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent"
                    >
                      <span className="truncate font-medium">{e.summary}</span>
                      <span className="shrink-0 text-caption text-muted-foreground tabular">
                        {timeOf(e)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {events.data && (
        <p className="text-caption text-muted-foreground">
          Fetched live {new Date(events.data.fetchedAt).toLocaleTimeString()} · {r.label} · Google
          Calendar is the source of truth.
        </p>
      )}
    </div>
  );
}
