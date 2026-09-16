"use client";

import { useState } from "react";
import { NEXT_STATUSES, type Job, type JobStatus } from "@/lib/types";
import { JobHistory } from "./JobHistory";

interface Props {
  job: Job;
  onChangeStatus: (id: string, status: JobStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onError: (message: string) => void;
}

const ACTION_LABELS: Record<JobStatus, string> = {
  pending: "Reset",
  running: "Start",
  completed: "Complete",
  failed: "Mark failed",
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function JobRow({ job, onChangeStatus, onDelete, onError }: Props) {
  // Per-row busy flag: disables this row's buttons while a request is in flight,
  // so a double-click can't send two requests from the same tab.
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const nextStatuses = NEXT_STATUSES[job.status];

  return (
    <>
      <tr aria-busy={busy}>
        <td className="job-title">{job.title}</td>
        <td>
          <code>{job.type}</code>
        </td>
        <td>
          <span className={`badge badge-${job.status}`}>{job.status}</span>
        </td>
        <td className="muted">
          <time dateTime={job.createdAt}>{dateFormat.format(new Date(job.createdAt))}</time>
        </td>
        <td className="actions">
          <button
            type="button"
            className="action"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? "Hide history" : "History"}
          </button>
          {nextStatuses.map((status) => (
            <button
              key={status}
              type="button"
              className={`action action-${status}`}
              disabled={busy}
              onClick={() => run(() => onChangeStatus(job.id, status))}
            >
              {ACTION_LABELS[status]}
            </button>
          ))}
          <button
            type="button"
            className="action action-delete"
            disabled={busy || job.status === "running"}
            title={job.status === "running" ? "Running jobs can't be deleted" : undefined}
            onClick={() => {
              if (confirm(`Delete "${job.title}"?`)) void run(() => onDelete(job.id));
            }}
          >
            Delete
          </button>
        </td>
      </tr>
      {showHistory && (
        <tr className="history-row">
          <td colSpan={5}>
            <JobHistory jobId={job.id} version={job.version} />
          </td>
        </tr>
      )}
    </>
  );
}
