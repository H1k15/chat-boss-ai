import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CustomerStatus } from '@cba/shared';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  findAll(
    @Query('status') status?: CustomerStatus,
    @Query('assignedTo') assignedTo?: string,
    @Query('area') area?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    return this.customers.findAll({
      status,
      assignedTo,
      area,
      q,
      page: page ? parseInt(page) : 1,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Post()
  create(@Body() body: Parameters<CustomersService['create']>[0]) {
    return this.customers.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.customers.update(id, body);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() body: { content: string }) {
    return this.customers.addNote(id, body.content);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: { staffId: string }) {
    return this.customers.update(id, { assignedTo: { connect: { id: body.staffId } } });
  }
}
