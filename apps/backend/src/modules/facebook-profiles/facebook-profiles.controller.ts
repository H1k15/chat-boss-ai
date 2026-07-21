import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { FacebookProfilesService } from './facebook-profiles.service';

@Controller('facebook-profiles')
export class FacebookProfilesController {
  constructor(private readonly profiles: FacebookProfilesService) {}

  @Get()
  findAll(@Query('ownerId') ownerId?: string) {
    return this.profiles.findAll(ownerId);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.profiles.create(body as never);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.profiles.update(id, body);
  }
}
