import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex, TableUnique } from 'typeorm';

type Status = 'pending' | 'running' | 'completed' | 'failed';

/** The only legal path from creation to each status, used to backfill history. */
const PATH_TO: Record<Status, [Status, Status][]> = {
  pending: [],
  running: [['pending', 'running']],
  completed: [
    ['pending', 'running'],
    ['running', 'completed'],
  ],
  failed: [
    ['pending', 'running'],
    ['running', 'failed'],
  ],
};

export class AddJobEvents1758100000000 implements MigrationInterface {
  name = 'AddJobEvents1758100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    /** Positional placeholders: `$1, $2` for PostgreSQL, `?, ?` for SQLite. */
    const params = (count: number, start = 1) =>
      Array.from({ length: count }, (_, i) => (isPostgres ? `$${start + i}` : '?')).join(', ');

    await queryRunner.addColumn(
      'jobs',
      new TableColumn({ name: 'version', type: 'integer', isNullable: false, default: 1 }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'job_events',
        columns: [
          { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'jobId', type: 'varchar', length: '36', isNullable: false },
          { name: 'sequence', type: 'integer', isNullable: false },
          { name: 'eventType', type: 'varchar', length: '40', isNullable: false },
          { name: 'fromStatus', type: 'varchar', length: '20', isNullable: true },
          { name: 'toStatus', type: 'varchar', length: '20', isNullable: true },
          { name: 'payload', type: 'text', isNullable: false },
          {
            name: 'occurredAt',
            type: isPostgres ? 'timestamp' : 'datetime',
            isNullable: false,
            default: isPostgres ? 'now()' : "(datetime('now'))",
          },
        ],
        uniques: [new TableUnique({ name: 'UQ_job_events_job_sequence', columnNames: ['jobId', 'sequence'] })],
      }),
    );

    await queryRunner.createIndex(
      'job_events',
      new TableIndex({ name: 'IDX_job_events_occurred_at', columnNames: ['occurredAt'] }),
    );

    // Backfill: give every pre-existing job the history that must have led to its status.
    const jobs: { id: string; title: string; type: string; status: Status; createdAt: Date; updatedAt: Date }[] =
      await queryRunner.manager
        .createQueryBuilder()
        .select(['id', 'title', 'type', 'status', '"createdAt"', '"updatedAt"'])
        .from('jobs', 'jobs')
        .getRawMany();

    for (const job of jobs) {
      const payload = JSON.stringify({ title: job.title, type: job.type, backfilled: true });
      const events = [
        { eventType: 'JobCreated', fromStatus: null, toStatus: 'pending', occurredAt: job.createdAt },
        ...PATH_TO[job.status].map(([from, to]) => ({
          eventType: 'JobStatusChanged',
          fromStatus: from,
          toStatus: to,
          occurredAt: job.updatedAt,
        })),
      ];

      // Raw SQL on purpose: a query builder would pick up the JobEvent entity's
      // `simple-json` transformer when it is registered and double-encode the payload.
      for (const [i, e] of events.entries()) {
        await queryRunner.query(
          `INSERT INTO job_events ("jobId", "sequence", "eventType", "fromStatus", "toStatus", "payload", "occurredAt")
           VALUES (${params(7)})`,
          [String(job.id), i + 1, e.eventType, e.fromStatus, e.toStatus, payload, e.occurredAt],
        );
      }
      await queryRunner.query(`UPDATE jobs SET version = ${params(1)} WHERE id = ${params(1, 2)}`, [
        events.length,
        job.id,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('job_events');
    await queryRunner.dropColumn('jobs', 'version');
  }
}
