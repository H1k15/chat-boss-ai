import { Module } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule], // để dùng RoomMatcherService cho POST /rooms/match
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
