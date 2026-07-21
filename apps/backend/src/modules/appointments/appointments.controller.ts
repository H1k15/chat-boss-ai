import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  findAll(
    @Query('date') date?: string,
    @Query('staffId') staffId?: string,
    @Query('status') status?: string,
  ) {
    return this.appointments.findAll({ date, staffId, status });
  }

  @Post()
  create(@Body() body: Parameters<AppointmentsService['create']>[0]) {
    return this.appointments.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.appointments.update(id, body);
  }
}
