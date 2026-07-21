import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CareTaskStatus } from '@prisma/client';
import { CareTasksService } from './care-tasks.service';

@Controller('care-tasks')
export class CareTasksController {
  constructor(private readonly careTasks: CareTasksService) {}

  @Get()
  findAll(
    @Query('staffId') staffId?: string,
    @Query('status') status?: CareTaskStatus,
    @Query('due') due?: string,
  ) {
    return this.careTasks.findAll({ staffId, status, due });
  }

  @Post()
  create(@Body() body: Parameters<CareTasksService['create']>[0]) {
    return this.careTasks.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.careTasks.update(id, body);
  }
}
