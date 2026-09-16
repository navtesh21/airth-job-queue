import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { JobEvent } from '../jobs/job-event.entity';
import { Job } from '../jobs/job.entity';
import { CreateJobs1758000000000 } from './migrations/1758000000000-CreateJobs';
import { AddJobEvents1758100000000 } from './migrations/1758100000000-AddJobEvents';

export const entities = [Job, JobEvent];
export const migrations = [CreateJobs1758000000000, AddJobEvents1758100000000];

/**
 * PostgreSQL when DATABASE_URL is set (production), otherwise SQLite (local dev).
 * Schema is always managed by migrations — `synchronize` is off so a deploy can
 * never silently alter or drop production columns.
 */
export function buildTypeOrmOptions(env: NodeJS.ProcessEnv = process.env): TypeOrmModuleOptions {
  if (env.DATABASE_URL) {
    return {
      type: 'postgres',
      url: env.DATABASE_URL,
      ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      entities,
      migrations,
      migrationsRun: true,
      synchronize: false,
    };
  }

  return {
    type: 'better-sqlite3',
    database: env.SQLITE_PATH ?? 'data/jobs.sqlite',
    entities,
    migrations,
    migrationsRun: true,
    synchronize: false,
  };
}
