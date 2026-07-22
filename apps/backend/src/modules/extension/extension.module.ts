import { Module } from '@nestjs/common';
import { ExtensionController } from './extension.controller';

@Module({
  controllers: [ExtensionController],
})
export class ExtensionModule {}
