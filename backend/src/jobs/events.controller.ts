import { Controller, Get, Query } from '@nestjs/common';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { JobEvent } from './job-event.entity';
import { JobsService } from './jobs.service';

@Controller('events')
export class EventsController {
  constructor(private readonly jobsService: JobsService) {}

  /** Activity feed: the most recent events across all jobs. */
  @Get()
  findRecent(@Query() query: ListEventsQueryDto): Promise<JobEvent[]> {
    return this.jobsService.findRecentEvents(query.limit);
  }
}
