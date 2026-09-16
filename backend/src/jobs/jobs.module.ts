import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { JobEvent } from './job-event.entity';
import { Job } from './job.entity';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobEvent])],
  controllers: [JobsController, EventsController],
  providers: [JobsService],
})
export class JobsModule {}
