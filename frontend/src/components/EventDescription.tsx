import type { JobEvent } from "@/lib/types";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" });

export function formatEventTime(event: JobEvent): string {
  return timeFormat.format(new Date(event.occurredAt));
}

/** One-line, human-readable description of an event. */
export function EventDescription({ event }: { event: JobEvent }) {
  switch (event.eventType) {
    case "JobCreated":
      return <>Created as <span className="badge badge-pending">pending</span></>;
    case "JobStatusChanged":
      return (
        <>
          <span className={`badge badge-${event.fromStatus}`}>{event.fromStatus}</span>
          {" → "}
          <span className={`badge badge-${event.toStatus}`}>{event.toStatus}</span>
        </>
      );
    case "JobDeleted":
      return <>Deleted (was {event.fromStatus})</>;
  }
}
