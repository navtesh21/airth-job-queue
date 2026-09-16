import { IsIn, IsOptional } from 'class-validator';
import { JOB_STATUSES, JobStatus } from '../job-status';

export class ListJobsQueryDto {
  @IsOptional()
  @IsIn(JOB_STATUSES, { message: `status must be one of: ${JOB_STATUSES.join(', ')}` })
  status?: JobStatus;
}
