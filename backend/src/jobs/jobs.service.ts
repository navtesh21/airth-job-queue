import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CreateJobDto } from './dto/create-job.dto';
import { JobEvent, JobEventType } from './job-event.entity';
import { compareWithStored, replayJobEvents, ReplayedJob } from './job-replay';
import { canTransition, JobStatus } from './job-status';
import { Job } from './job.entity';

export interface JobReplayReport {
  jobId: string;
  eventCount: number;
  replayed: ReplayedJob | null;
  stored: Job | null;
  consistent: boolean;
  problems: string[];
}

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
    @InjectRepository(JobEvent)
    private readonly events: Repository<JobEvent>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  findAll(status?: JobStatus): Promise<Job[]> {
    return this.jobs.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobs.findOneBy({ id });
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return job;
  }

  create(dto: CreateJobDto): Promise<Job> {
    return this.dataSource.transaction(async (manager) => {
      const job = await manager.save(
        manager.create(Job, { title: dto.title, type: dto.type, status: 'pending', version: 1 }),
      );
      await this.appendEvent(manager, job, 'JobCreated', null, 'pending');
      return job;
    });
  }

  /**
   * Transitions a job to `target` and records a JobStatusChanged event.
   *
   * A naive "read the job, check the rule, then save" has a race: two requests
   * can both read `pending`, both pass the check, and both write `running`.
   *
   * Here the write only succeeds if nobody else has changed the job since we read it:
   *
   *   UPDATE jobs SET status = :target, version = version + 1
   *   WHERE id = :id AND version = :versionWeRead AND status = :statusWeRead
   *
   * The database evaluates the WHERE clause and applies the write atomically
   * (the row stays locked until the transaction commits), so exactly one
   * concurrent request matches. Every other request affects 0 rows, gets a 409,
   * and its transaction rolls back without writing an event.
   *
   * The event is inserted in the same transaction, so the jobs table and the
   * event log can never disagree. The unique (jobId, sequence) constraint is a
   * second line of defence: two writers can never both record event #N.
   */
  updateStatus(id: string, target: JobStatus): Promise<Job> {
    return this.dataSource.transaction(async (manager) => {
      const current = await this.findOneOrFail(manager, id);
      this.assertCanTransition(current, target);

      const result = await manager
        .createQueryBuilder()
        .update(Job)
        .set({ status: target, version: () => 'version + 1' })
        .where('id = :id', { id })
        .andWhere('version = :version', { version: current.version })
        .andWhere('status = :status', { status: current.status })
        .execute();

      if (result.affected !== 1) {
        // Someone else changed the job between our read and our write.
        const latest = await this.findOneOrFail(manager, id);
        this.assertCanTransition(latest, target);
        throw this.conflict('CONCURRENT_MODIFICATION', 'Job was modified by someone else. Please retry.', latest);
      }

      const updated = await this.findOneOrFail(manager, id);
      await this.appendEvent(manager, updated, 'JobStatusChanged', current.status, target);
      return updated;
    });
  }

  /** Deletes a job unless it is running, and records a JobDeleted event. The history is kept. */
  remove(id: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const current = await this.findOneOrFail(manager, id);
      this.assertDeletable(current);

      const result = await manager
        .createQueryBuilder()
        .delete()
        .from(Job)
        .where('id = :id', { id })
        .andWhere('version = :version', { version: current.version })
        .andWhere("status <> 'running'")
        .execute();

      if (result.affected !== 1) {
        const latest = await this.findOneOrFail(manager, id);
        this.assertDeletable(latest);
        throw this.conflict('CONCURRENT_MODIFICATION', 'Job was modified by someone else. Please retry.', latest);
      }

      await this.appendEvent(
        manager,
        { ...current, version: current.version + 1 },
        'JobDeleted',
        current.status,
        null,
      );
    });
  }

  /** Full event history for a job, oldest first. Works for deleted jobs too. */
  async findEvents(jobId: string): Promise<JobEvent[]> {
    const events = await this.events.find({ where: { jobId }, order: { sequence: 'ASC' } });
    if (events.length === 0 && !(await this.jobs.existsBy({ id: jobId }))) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    return events;
  }

  /** Most recent events across all jobs, newest first. */
  findRecentEvents(limit: number): Promise<JobEvent[]> {
    return this.events.find({ order: { id: 'DESC' }, take: limit });
  }

  /**
   * Rebuilds the job from its events alone and checks the result against the
   * stored row. This verifies that the current state was reached only through
   * legal transitions and that the two sources of truth agree.
   */
  async replay(jobId: string): Promise<JobReplayReport> {
    const [events, stored] = await Promise.all([
      this.events.find({ where: { jobId }, order: { sequence: 'ASC' } }),
      this.jobs.findOneBy({ id: jobId }),
    ]);

    if (events.length === 0 && !stored) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const { state, problems } = replayJobEvents(events);
    problems.push(...compareWithStored(state, stored));

    return {
      jobId,
      eventCount: events.length,
      replayed: state,
      stored,
      consistent: problems.length === 0,
      problems,
    };
  }

  private appendEvent(
    manager: EntityManager,
    job: Pick<Job, 'id' | 'title' | 'type' | 'version'>,
    eventType: JobEventType,
    fromStatus: JobStatus | null,
    toStatus: JobStatus | null,
  ) {
    return manager.insert(JobEvent, {
      jobId: job.id,
      sequence: job.version,
      eventType,
      fromStatus,
      toStatus,
      payload: { title: job.title, type: job.type },
    });
  }

  private async findOneOrFail(manager: EntityManager, id: string): Promise<Job> {
    const job = await manager.findOneBy(Job, { id });
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return job;
  }

  private assertCanTransition(job: Job, target: JobStatus): void {
    if (job.status === target) {
      throw this.conflict(
        'STATUS_ALREADY_SET',
        `Job is already ${target}. It may have been updated by someone else.`,
        job,
      );
    }
    if (!canTransition(job.status, target)) {
      throw this.conflict('INVALID_TRANSITION', `Cannot change job status from ${job.status} to ${target}.`, job);
    }
  }

  private assertDeletable(job: Job): void {
    if (job.status === 'running') {
      throw this.conflict(
        'JOB_RUNNING',
        'A running job cannot be deleted. Mark it completed or failed first.',
        job,
      );
    }
  }

  private conflict(code: string, message: string, job: Job): ConflictException {
    return new ConflictException({ statusCode: 409, error: 'Conflict', code, message, job });
  }
}
