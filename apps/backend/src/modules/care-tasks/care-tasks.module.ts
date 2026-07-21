import { Module } from '@nestjs/common';
import { CareTasksService } from './care-tasks.service';
import { CareTasksController } from './care-tasks.controller';

@Module({
  controllers: [CareTasksController],
  providers: [CareTasksService],
  exports: [CareTasksService],
})
export class CareTasksModule {}
