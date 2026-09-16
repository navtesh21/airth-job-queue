"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { JobEvent } from "@/lib/types";
import { EventDescription, formatEventTime } from "./EventDescription";

interface Props {
  /** Changes whenever the job list changes; used to know when to refetch. */
  revision: string;
}

export function ActivityFeed({ revision }: Props) {
  const [events, setEvents] = useState<JobEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .recentEvents(15)
      .then((data) => {
        if (cancelled) return;
        setEvents(data);
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [revision]);

  return (
    <section className="card">
      <h2>Recent activity</h2>
      {error && <p className="form-error">Could not load activity: {error}</p>}
      {!events && !error && <p className="muted">Loading…</p>}
      {events?.length === 0 && <p className="muted">No events yet.</p>}
      {events && events.length > 0 && (
        <ol className="timeline">
          {events.map((event) => (
            <li key={event.id}>
              <span className="timeline-text">
                <strong>{event.payload.title}</strong> <EventDescription event={event} />
              </span>
              <time className="muted" dateTime={event.occurredAt}>
                {formatEventTime(event)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
