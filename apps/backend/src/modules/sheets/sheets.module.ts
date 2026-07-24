import { Module } from '@nestjs/common';
import { SheetsService } from './sheets.service';
import { SheetsController } from './sheets.controller';
import { ExcelModule } from '../excel/excel.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [ExcelModule, AiModule], // importRows chuẩn hoá + LLM_PROVIDER dò loại
  controllers: [SheetsController],
  providers: [SheetsService],
})
export class SheetsModule {}
