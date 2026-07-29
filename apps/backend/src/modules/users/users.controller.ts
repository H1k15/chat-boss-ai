import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { UserRole } from '@cba/shared';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

// Quản lý nhân viên nội bộ nhà trọ. CHỈ ADMIN (chủ trọ) được dùng — nhân viên
// STAFF/MANAGER không thấy được các endpoint này.
@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Post()
  create(@Body() body: Parameters<UsersService['create']>[0]) {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Parameters<UsersService['update']>[1],
    @Req() req: AuthenticatedRequest,
  ) {
    return this.users.update(id, body, req.user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.users.remove(id, req.user.userId);
  }
}
