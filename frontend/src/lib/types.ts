export const JOB_STATUSES = ["pending", "running", "completed", "failed"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface Job {
  id: string;
  title: string;
  type: string;
  status: JobStatus;
  /** Number of events recorded for this job; bumps on every change. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type JobEventType = "JobCreated" | "JobStatusChanged" | "JobDeleted";

export interface JobEvent {
  id: number;
  jobId: string;
  sequence: number;
  eventType: JobEventType;
  fromStatus: JobStatus | null;
  toStatus: JobStatus | null;
  payload: { title: string; type: string; backfilled?: boolean };
  occurredAt: string;
}

export interface ReplayReport {
  jobId: string;
  eventCount: number;
  replayed: { status: JobStatus; title: string; type: string; version: number; deleted: boolean } | null;
  stored: Job | null;
  consistent: boolean;
  problems: string[];
}

/**
 * Mirrors the backend state machine. Used only to decide which buttons to show —
 * the server is the source of truth and enforces the rule on every request.
 */
export const NEXT_STATUSES: Record<JobStatus, JobStatus[]> = {
  pending: ["running"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
};
