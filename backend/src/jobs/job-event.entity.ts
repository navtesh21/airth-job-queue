import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { JobStatus } from './job-status';

export const JOB_EVENT_TYPES = ['JobCreated', 'JobStatusChanged', 'JobDeleted'] as const;

export type JobEventType = (typeof JOB_EVENT_TYPES)[number];

/** Snapshot of the job's descriptive fields at the time of the event. */
export interface JobEventPayload {
  title: string;
  type: string;
  backfilled?: boolean;
}

/**
 * Append-only log of everything that happened to a job. Rows are only ever inserted.
 *
 * There is intentionally no foreign key to `jobs`: the history of a deleted job
 * must survive the deletion.
 */
@Entity({ name: 'job_events' })
@Unique('UQ_job_events_job_sequence', ['jobId', 'sequence'])
export class JobEvent {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 36 })
  jobId: string;

  /** 1-based position of this event within its job's history. */
  @Column({ type: 'integer' })
  sequence: number;

  @Column({ type: 'varchar', length: 40 })
  eventType: JobEventType;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fromStatus: JobStatus | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  toStatus: JobStatus | null;

  @Column({ type: 'simple-json' })
  payload: JobEventPayload;

  @Index('IDX_job_events_occurred_at')
  @CreateDateColumn()
  occurredAt: Date;
}
