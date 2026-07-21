import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RoomStatus } from '@prisma/client';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  findAll(
    @Query('area') area?: string,
    @Query('status') status?: RoomStatus,
    @Query('priceMax') priceMax?: string,
    @Query('roomType') roomType?: string,
    @Query('q') q?: string,
  ) {
    return this.rooms.findAll({
      area,
      status,
      priceMax: priceMax ? parseInt(priceMax) : undefined,
      roomType,
      q,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rooms.findOne(id);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.rooms.create(body as never);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.rooms.update(id, body);
  }
}
