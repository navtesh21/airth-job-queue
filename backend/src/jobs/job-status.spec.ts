import { canTransition, JOB_STATUSES, sourceStatusesFor } from './job-status';

describe('job status state machine', () => {
  it.each([
    ['pending', 'running'],
    ['running', 'completed'],
    ['running', 'failed'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['pending', 'completed'],
    ['pending', 'failed'],
    ['running', 'pending'],
    ['completed', 'running'],
    ['failed', 'running'],
    ['completed', 'failed'],
    ['failed', 'completed'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('never allows a status to transition to itself', () => {
    for (const status of JOB_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('derives source statuses for the conditional update', () => {
    expect(sourceStatusesFor('running')).toEqual(['pending']);
    expect(sourceStatusesFor('completed')).toEqual(['running']);
    expect(sourceStatusesFor('failed')).toEqual(['running']);
    expect(sourceStatusesFor('pending')).toEqual([]);
  });
});
