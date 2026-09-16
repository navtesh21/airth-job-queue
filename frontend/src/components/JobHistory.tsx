"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { JobEvent, ReplayReport } from "@/lib/types";
import { EventDescription, formatEventTime } from "./EventDescription";

interface Props {
  jobId: string;
  /** The job's version; the history reloads whenever it changes. */
  version: number;
}

type Loadable<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

export function JobHistory({ jobId, version }: Props) {
  const [events, setEvents] = useState<Loadable<JobEvent[]>>({ status: "loading" });
  // Tagged with the version it was run against: a replay of an older version is stale.
  const [replayState, setReplay] = useState<{ version: number; result: Loadable<ReplayReport> } | null>(null);
  const replay = replayState?.version === version ? replayState.result : null;

  useEffect(() => {
    let cancelled = false;
    api
      .jobEvents(jobId)
      .then((data) => !cancelled && setEvents({ status: "ready", data }))
      .catch((err: Error) => !cancelled && setEvents({ status: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [jobId, version]);

  async function verify() {
    const runVersion = version;
    setReplay({ version: runVersion, result: { status: "loading" } });
    try {
      setReplay({ version: runVersion, result: { status: "ready", data: await api.replayJob(jobId) } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Replay failed.";
      setReplay({ version: runVersion, result: { status: "error", message } });
    }
  }

  return (
    <div className="history">
      <div className="history-header">
        <h3>Event history</h3>
        <button type="button" onClick={verify} disabled={replay?.status === "loading"}>
          {replay?.status === "loading" ? "Replaying…" : "Verify by replay"}
        </button>
      </div>

      {events.status === "loading" && <p className="muted">Loading events…</p>}
      {events.status === "error" && <p className="form-error">Could not load events: {events.message}</p>}
      {events.status === "ready" && (
        <ol className="timeline">
          {events.data.map((event) => (
            <li key={event.id}>
              <span className="seq">#{event.sequence}</span>
              <span className="timeline-text">
                <EventDescription event={event} />
                {event.payload.backfilled && <span className="muted"> (backfilled)</span>}
              </span>
              <time className="muted" dateTime={event.occurredAt}>
                {formatEventTime(event)}
              </time>
            </li>
          ))}
        </ol>
      )}

      {replay?.status === "error" && <p className="form-error">{replay.message}</p>}
      {replay?.status === "ready" && <ReplayResult report={replay.data} />}
    </div>
  );
}

function ReplayResult({ report }: { report: ReplayReport }) {
  if (report.consistent) {
    return (
      <p className="replay replay-ok" role="status">
        ✓ Verified: replaying {report.eventCount} event{report.eventCount === 1 ? "" : "s"} through the state
        machine gives <strong>{report.replayed?.status}</strong> (v{report.replayed?.version}), which matches the
        stored job.
      </p>
    );
  }

  return (
    <div className="replay replay-bad" role="alert">
      <strong>✗ Inconsistent: the stored job does not match its event history.</strong>
      <ul>
        {report.problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
