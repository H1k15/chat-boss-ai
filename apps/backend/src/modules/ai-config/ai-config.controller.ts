import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { UserRole } from '@cba/shared';
import { AiConfigService } from './ai-config.service';
import { Roles } from '../auth/roles.guard';

// Admin "train" Lớp 1 (điểm mốc + cụm khu) qua dashboard, không cần sửa code.
// Đọc: ai đăng nhập cũng xem được. Ghi: chỉ ADMIN (ảnh hưởng toàn hệ thống).
@Controller('ai-config')
export class AiConfigController {
  constructor(private readonly cfg: AiConfigService) {}

  @Get('landmarks')
  getLandmarks() {
    return this.cfg.getLandmarks();
  }

  @Roles(UserRole.ADMIN)
  @Put('landmarks')
  saveLandmarks(@Body() body: { landmarks: unknown }) {
    return this.cfg.saveLandmarks(body.landmarks);
  }

  @Roles(UserRole.ADMIN)
  @Post('landmarks/reset')
  resetLandmarks() {
    return this.cfg.resetLandmarks();
  }

  @Get('area-groups')
  getAreaGroups() {
    return this.cfg.getAreaGroups();
  }

  @Roles(UserRole.ADMIN)
  @Put('area-groups')
  saveAreaGroups(@Body() body: { groups: unknown }) {
    return this.cfg.saveAreaGroups(body.groups);
  }

  @Roles(UserRole.ADMIN)
  @Post('area-groups/reset')
  resetAreaGroups() {
    return this.cfg.resetAreaGroups();
  }
}
