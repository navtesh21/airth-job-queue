import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { entities, migrations } from '../src/database/database.config';
import { CreateJobs1758000000000 } from '../src/database/migrations/1758000000000-CreateJobs';
import { JobEvent } from '../src/jobs/job-event.entity';
import { replayJobEvents } from '../src/jobs/job-replay';

/**
 * Simulates upgrading a database that already has jobs from before the event
 * log existed, and checks that the backfilled history replays cleanly.
 */
describe('AddJobEvents migration backfill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobs-migration-'));
  const database = join(dir, 'jobs.sqlite');
  let upgraded: DataSource | undefined;

  afterAll(async () => {
    await upgraded?.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('backfills a valid history for existing jobs', async () => {
    // 1. A database at the old schema, with jobs in every status.
    const legacy = new DataSource({ type: 'better-sqlite3', database, migrations: [CreateJobs1758000000000] });
    await legacy.initialize();
    await legacy.runMigrations();
    for (const [i, status] of ['pending', 'running', 'completed', 'failed'].entries()) {
      await legacy.query(`INSERT INTO jobs (id, title, type, status) VALUES (?, ?, 'legacy', ?)`, [
        `00000000-0000-4000-8000-00000000000${i}`,
        `Old ${status} job`,
        status,
      ]);
    }
    await legacy.destroy();

    // 2. Upgrade it with the full migration list.
    upgraded = new DataSource({ type: 'better-sqlite3', database, entities, migrations });
    await upgraded.initialize();
    await upgraded.runMigrations();

    const jobs: { id: string; status: string; version: number }[] = await upgraded.query(
      'SELECT id, status, version FROM jobs ORDER BY id',
    );
    expect(jobs.map((j) => [j.status, j.version])).toEqual([
      ['pending', 1],
      ['running', 2],
      ['completed', 3],
      ['failed', 3],
    ]);

    for (const job of jobs) {
      const events = await upgraded
        .getRepository(JobEvent)
        .find({ where: { jobId: job.id }, order: { sequence: 'ASC' } });
      const { state, problems } = replayJobEvents(events);
      expect(problems).toEqual([]);
      expect(state).toMatchObject({ status: job.status, version: job.version, deleted: false });
      expect(events[0].payload).toEqual({ title: `Old ${job.status} job`, type: 'legacy', backfilled: true });
    }

    // The CHECK constraint must survive SQLite's table rebuild when adding the column.
    await expect(upgraded.query(`UPDATE jobs SET status = 'exploded'`)).rejects.toThrow(/CHECK/);
  });
});
