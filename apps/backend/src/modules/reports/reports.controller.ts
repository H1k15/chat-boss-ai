import { Controller, Get } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview() {
    return this.reports.overview();
  }

  @Get('by-staff')
  byStaff() {
    return this.reports.byStaff();
  }

  @Get('by-area')
  byArea() {
    return this.reports.byArea();
  }

  @Get('by-room')
  byRoom() {
    return this.reports.byRoom();
  }
}
