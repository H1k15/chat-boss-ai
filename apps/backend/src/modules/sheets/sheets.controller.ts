import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { UserRole } from '@cba/shared';
import { SheetsService } from './sheets.service';
import { Roles } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('sheets')
export class SheetsController {
  constructor(private readonly sheets: SheetsService) {}

  // Cấu hình sheet đã lưu (để nút Đồng bộ biết đã cấu hình chưa).
  @Get('config')
  config() {
    return this.sheets.getConfig();
  }

  // Đồng bộ dùng cấu hình đã lưu — nút một-cú-bấm ở các màn có data từ sheet.
  @Roles(UserRole.ADMIN)
  @Post('sync-saved')
  syncSaved(@Req() req: AuthenticatedRequest) {
    return this.sheets.syncSaved(req.user.userId);
  }

  // Đồng bộ phòng từ Google Sheet. Rủi ro cao như import Excel -> chỉ admin.
  @Roles(UserRole.ADMIN)
  @Post('sync')
  sync(
    @Body() body: { spreadsheetId: string; range?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sheets.sync(
      body.spreadsheetId,
      body.range || 'A1:Z10000',
      req.user.userId,
    );
  }

  // Đồng bộ sheet "bảng tổng hợp" (tiêu đề không ở hàng 1, không có cột mã
  // phòng/khu vực/trạng thái riêng). Mặc định tiêu đề ở hàng 2.
  @Roles(UserRole.ADMIN)
  @Post('sync-rooms')
  syncRooms(
    @Body()
    body: { spreadsheetId: string; sheetName?: string; headerRow?: number },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sheets.syncRooms(
      body.spreadsheetId,
      body.sheetName,
      body.headerRow ?? 2,
      req.user.userId,
    );
  }
}
