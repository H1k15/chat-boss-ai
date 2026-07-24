import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
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

  // Map link ảnh/video/vị trí theo phòng (đọc từ hyperlink trong sheet).
  @Get('room-media')
  roomMedia() {
    return this.sheets.getMedia();
  }

  // Nhân viên gán/sửa loại phòng (tạo nhãn vàng). Ai đăng nhập cũng dùng được
  // — đây là thao tác nghiệp vụ thường ngày, không phải hành động rủi ro cao.
  // type rỗng/null = xoá gán tay, trả về dò tự động.
  @Patch('rooms/:id/type')
  setRoomType(@Param('id') id: string, @Body() body: { type?: string | null }) {
    return this.sheets.setRoomType(id, body.type ?? null);
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
