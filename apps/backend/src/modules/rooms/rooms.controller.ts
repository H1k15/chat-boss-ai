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
import type { ExtractedInfo } from '@cba/shared';
import { RoomsService } from './rooms.service';
import { RoomMatcherService } from '../ai/pipeline/room-matcher.service';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly matcher: RoomMatcherService,
  ) {}

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

  // Lọc phòng theo yêu cầu (tái dùng logic của pipeline AI). Chỉ trả phòng
  // CÒN TRỐNG, kèm điểm khớp — nguồn sự thật duy nhất về phòng.
  @Post('match')
  match(
    @Body()
    body: {
      area?: string;
      budgetMin?: number;
      budgetMax?: number;
      peopleCount?: number;
      requirements?: string[];
    },
  ) {
    const info: ExtractedInfo = {
      area: body.area,
      budgetMin: body.budgetMin,
      budgetMax: body.budgetMax,
      peopleCount: body.peopleCount,
      requirements: body.requirements,
    };
    return this.matcher.match(info);
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
