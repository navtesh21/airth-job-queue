import type { JobEvent } from './job-event.entity';
import { compareWithStored, replayJobEvents } from './job-replay';
import type { JobStatus } from './job-status';
import type { Job } from './job.entity';

const JOB_ID = '2f76d608-c724-4f2d-8f62-e37b238bf056';

function event(
  sequence: number,
  eventType: JobEvent['eventType'],
  fromStatus: JobStatus | null,
  toStatus: JobStatus | null,
): JobEvent {
  return {
    id: sequence,
    jobId: JOB_ID,
    sequence,
    eventType,
    fromStatus,
    toStatus,
    payload: { title: 'Backup', type: 'cleanup' },
    occurredAt: new Date(),
  };
}

const created = event(1, 'JobCreated', null, 'pending');
const started = event(2, 'JobStatusChanged', 'pending', 'running');
const completed = event(3, 'JobStatusChanged', 'running', 'completed');

function storedJob(overrides: Partial<Job> = {}): Job {
  return {
    id: JOB_ID,
    title: 'Backup',
    type: 'cleanup',
    status: 'completed',
    version: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('replayJobEvents', () => {
  it('rebuilds state from a valid history', () => {
    const { state, problems } = replayJobEvents([created, started, completed]);
    expect(problems).toEqual([]);
    expect(state).toEqual({
      id: JOB_ID,
      title: 'Backup',
      type: 'cleanup',
      status: 'completed',
      version: 3,
      deleted: false,
    });
  });

  it('marks deleted jobs', () => {
    const { state, problems } = replayJobEvents([created, event(2, 'JobDeleted', 'pending', null)]);
    expect(problems).toEqual([]);
    expect(state?.deleted).toBe(true);
  });

  it('detects an illegal transition', () => {
    const { problems } = replayJobEvents([created, event(2, 'JobStatusChanged', 'pending', 'completed')]);
    expect(problems).toEqual([expect.stringContaining('illegal transition pending -> completed')]);
  });

  it('detects a completed job becoming running again', () => {
    const { problems } = replayJobEvents([created, started, completed, event(4, 'JobStatusChanged', 'completed', 'running')]);
    expect(problems).toEqual([expect.stringContaining('illegal transition completed -> running')]);
  });

  it('detects a recorded fromStatus that does not match the replayed state', () => {
    const { problems } = replayJobEvents([created, started, event(3, 'JobStatusChanged', 'pending', 'running')]);
    expect(problems.some((p) => p.includes('recorded from pending, but replayed state was running'))).toBe(true);
  });

  it('detects gaps in the sequence', () => {
    const { problems } = replayJobEvents([created, completed]);
    expect(problems.some((p) => p.includes('expected sequence 2, found 3'))).toBe(true);
  });

  it('detects events before creation and after deletion', () => {
    expect(replayJobEvents([event(1, 'JobStatusChanged', 'pending', 'running')]).problems).toEqual([
      expect.stringContaining('before the job was created'),
    ]);
    const afterDelete = replayJobEvents([created, event(2, 'JobDeleted', 'pending', null), event(3, 'JobStatusChanged', 'pending', 'running')]);
    expect(afterDelete.problems).toEqual([expect.stringContaining('after the job was deleted')]);
  });
});

describe('compareWithStored', () => {
  const replayed = replayJobEvents([created, started, completed]).state;

  it('passes when replayed and stored state agree', () => {
    expect(compareWithStored(replayed, storedJob())).toEqual([]);
  });

  it('reports field mismatches', () => {
    expect(compareWithStored(replayed, storedJob({ status: 'failed' }))).toEqual([
      'status mismatch: replayed completed, stored failed',
    ]);
  });

  it('reports a job that should be deleted but still exists, and vice versa', () => {
    const deleted = replayJobEvents([created, event(2, 'JobDeleted', 'pending', null)]).state;
    expect(compareWithStored(deleted, storedJob())).toHaveLength(1);
    expect(compareWithStored(deleted, null)).toEqual([]);
    expect(compareWithStored(replayed, null)).toHaveLength(1);
  });
});
