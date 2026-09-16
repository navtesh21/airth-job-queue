import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JOB_STATUSES, JobStatus } from './job-status';

@Entity({ name: 'jobs' })
@Check('CHK_jobs_status', `status IN (${JOB_STATUSES.map((s) => `'${s}'`).join(', ')})`)
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 50 })
  type: string;

  @Index('IDX_jobs_status')
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: JobStatus;

  /**
   * Number of events recorded for this job. It is also the sequence number of the
   * latest event, and the value used for optimistic concurrency checks on writes.
   */
  @Column({ type: 'integer', default: 1 })
  version: number;

  @Index('IDX_jobs_created_at')
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
