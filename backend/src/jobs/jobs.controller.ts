import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';
import { JobEvent } from './job-event.entity';
import { Job } from './job.entity';
import { JobReplayReport, JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto): Promise<Job> {
    return this.jobsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListJobsQueryDto): Promise<Job[]> {
    return this.jobsService.findAll(query.status);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Job> {
    return this.jobsService.findOne(id);
  }

  @Get(':id/events')
  findEvents(@Param('id', ParseUUIDPipe) id: string): Promise<JobEvent[]> {
    return this.jobsService.findEvents(id);
  }

  @Get(':id/replay')
  replay(@Param('id', ParseUUIDPipe) id: string): Promise<JobReplayReport> {
    return this.jobsService.replay(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobStatusDto,
  ): Promise<Job> {
    return this.jobsService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.jobsService.remove(id);
  }
}
