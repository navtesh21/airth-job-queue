export const JOB_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * The job lifecycle, as a state machine:
 *
 *   pending -> running -> completed
 *                     \-> failed
 *
 * completed and failed are terminal.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  pending: ['running'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Every status that is allowed to move into `to`. Used to build the conditional UPDATE. */
export function sourceStatusesFor(to: JobStatus): JobStatus[] {
  return JOB_STATUSES.filter((from) => canTransition(from, to));
}
