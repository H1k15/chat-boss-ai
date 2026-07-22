import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@cba/shared';
import { ReplyTemplatesService } from './reply-templates.service';
import { Roles } from '../auth/roles.guard';

// Quản lý mẫu câu (few-shot cho AI). Nhân viên xem được; chỉ admin sửa vì mẫu
// câu ảnh hưởng cách AI trả lời trên toàn hệ thống.
@Controller('reply-templates')
export class ReplyTemplatesController {
  constructor(private readonly templates: ReplyTemplatesService) {}

  @Get()
  findAll(@Query('intent') intent?: string) {
    return this.templates.findAll(intent);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() body: { intent: string; label: string; content: string }) {
    return this.templates.create(body);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.templates.update(id, body);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templates.remove(id);
  }
}
