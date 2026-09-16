import { MigrationInterface, QueryRunner, Table, TableCheck, TableIndex } from 'typeorm';

/**
 * Written with TypeORM's schema builder (not raw SQL) so the same migration
 * runs on PostgreSQL (production) and SQLite (local dev / tests).
 */
export class CreateJobs1758000000000 implements MigrationInterface {
  name = 'CreateJobs1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const timestampType = isPostgres ? 'timestamp' : 'datetime';
    const now = isPostgres ? 'now()' : "(datetime('now'))";

    await queryRunner.createTable(
      new Table({
        name: 'jobs',
        columns: [
          isPostgres
            ? { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' }
            : { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'title', type: 'varchar', length: '200', isNullable: false },
          { name: 'type', type: 'varchar', length: '50', isNullable: false },
          { name: 'status', type: 'varchar', length: '20', isNullable: false, default: "'pending'" },
          { name: 'createdAt', type: timestampType, isNullable: false, default: now },
          { name: 'updatedAt', type: timestampType, isNullable: false, default: now },
        ],
        checks: [
          new TableCheck({
            name: 'CHK_jobs_status',
            expression: "status IN ('pending', 'running', 'completed', 'failed')",
          }),
        ],
      }),
    );

    await queryRunner.createIndex('jobs', new TableIndex({ name: 'IDX_jobs_status', columnNames: ['status'] }));
    await queryRunner.createIndex(
      'jobs',
      new TableIndex({ name: 'IDX_jobs_created_at', columnNames: ['createdAt'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('jobs');
  }
}
