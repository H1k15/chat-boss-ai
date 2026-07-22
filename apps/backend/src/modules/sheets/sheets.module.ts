import { Module } from '@nestjs/common';
import { SheetsService } from './sheets.service';
import { SheetsController } from './sheets.controller';
import { ExcelModule } from '../excel/excel.module';

@Module({
  imports: [ExcelModule], // dùng lại importRows để chuẩn hoá/upsert phòng
  controllers: [SheetsController],
  providers: [SheetsService],
})
export class SheetsModule {}
