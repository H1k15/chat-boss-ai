import { Module } from '@nestjs/common';
import { FacebookProfilesService } from './facebook-profiles.service';
import { FacebookProfilesController } from './facebook-profiles.controller';

@Module({
  controllers: [FacebookProfilesController],
  providers: [FacebookProfilesService],
  exports: [FacebookProfilesService],
})
export class FacebookProfilesModule {}
