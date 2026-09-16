import { IsIn } from 'class-validator';
import { JOB_STATUSES, JobStatus } from '../job-status';

export class UpdateJobStatusDto {
  @IsIn(JOB_STATUSES, { message: `status must be one of: ${JOB_STATUSES.join(', ')}` })
  status: JobStatus;
}
