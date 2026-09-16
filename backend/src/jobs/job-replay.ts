import type { JobEvent } from './job-event.entity';
import { canTransition, JobStatus } from './job-status';
import type { Job } from './job.entity';

export interface ReplayedJob {
  id: string;
  title: string;
  type: string;
  status: JobStatus;
  version: number;
  deleted: boolean;
}

export interface ReplayResult {
  state: ReplayedJob | null;
  problems: string[];
}

/**
 * Rebuilds a job's state purely from its event history, re-validating every step
 * against the state machine. `events` must be ordered by sequence.
 *
 * Problems are collected rather than thrown so a single report shows everything
 * that is wrong with a history.
 */
export function replayJobEvents(events: readonly JobEvent[]): ReplayResult {
  const problems: string[] = [];
  let state: ReplayedJob | null = null;

  events.forEach((event, index) => {
    const at = `event #${event.sequence} (${event.eventType})`;

    if (event.sequence !== index + 1) {
      problems.push(`${at}: expected sequence ${index + 1}, found ${event.sequence} (gap or duplicate)`);
    }

    if (state?.deleted) {
      problems.push(`${at}: occurs after the job was deleted`);
    }

    switch (event.eventType) {
      case 'JobCreated':
        if (state) {
          problems.push(`${at}: job was already created`);
          return;
        }
        if (event.toStatus !== 'pending') {
          problems.push(`${at}: jobs must be created as pending, not ${event.toStatus}`);
        }
        state = {
          id: event.jobId,
          title: event.payload.title,
          type: event.payload.type,
          status: event.toStatus ?? 'pending',
          version: event.sequence,
          deleted: false,
        };
        return;

      case 'JobStatusChanged':
        if (!state) {
          problems.push(`${at}: status change before the job was created`);
          return;
        }
        if (event.fromStatus !== state.status) {
          problems.push(`${at}: recorded from ${event.fromStatus}, but replayed state was ${state.status}`);
        }
        if (!event.toStatus || !canTransition(state.status, event.toStatus)) {
          problems.push(`${at}: illegal transition ${state.status} -> ${event.toStatus}`);
        }
        if (event.toStatus) state.status = event.toStatus;
        state.version = event.sequence;
        return;

      case 'JobDeleted':
        if (!state) {
          problems.push(`${at}: deletion before the job was created`);
          return;
        }
        if (state.status === 'running') {
          problems.push(`${at}: a running job was deleted`);
        }
        state.deleted = true;
        state.version = event.sequence;
        return;

      default:
        problems.push(`${at}: unknown event type`);
    }
  });

  return { state, problems };
}

/** Compares the replayed state with what is actually stored in the `jobs` table. */
export function compareWithStored(replayed: ReplayedJob | null, stored: Job | null): string[] {
  if (!replayed) {
    return stored ? ['job exists in the jobs table but has no events'] : [];
  }
  if (replayed.deleted) {
    return stored ? ['events say the job was deleted, but it still exists in the jobs table'] : [];
  }
  if (!stored) {
    return ['events say the job exists, but it is missing from the jobs table'];
  }

  const problems: string[] = [];
  for (const field of ['status', 'title', 'type', 'version'] as const) {
    if (replayed[field] !== stored[field]) {
      problems.push(`${field} mismatch: replayed ${replayed[field]}, stored ${stored[field]}`);
    }
  }
  return problems;
}
