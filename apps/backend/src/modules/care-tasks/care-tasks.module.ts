import { Module } from '@nestjs/common';
import { CareTasksService } from './care-tasks.service';
import { CareTasksController } from './care-tasks.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule], // để dùng AiService cho POST /care-tasks/:id/suggest
  controllers: [CareTasksController],
  providers: [CareTasksService],
  exports: [CareTasksService],
})
export class CareTasksModule {}
