import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { UserRole } from '@cba/shared';
import { GeocodeService } from './geocode.service';
import { Roles } from '../auth/roles.guard';

// Tiện ích geocode cho nhân viên/admin. Auth theo guard toàn cục.
@Controller('geocode')
export class GeocodeController {
  private readonly logger = new Logger(GeocodeController.name);
  constructor(private readonly geocode: GeocodeService) {}

  // Nạp trước toạ độ mọi phòng còn trống (chạy NỀN, 1 req/giây tới Nominatim).
  // Trả về ngay để không giữ HTTP; kết quả ghi log + cache.
  @Post('warm-rooms')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  warmRooms(): { started: boolean; note: string } {
    void this.geocode
      .warmRooms()
      .then((s) =>
        this.logger.log(
          `Warm rooms xong: ${s.geocoded} geocode mới, ${s.failed} thất bại, tổng ${s.total} phòng chưa có toạ độ`,
        ),
      )
      .catch((e) => this.logger.warn(`Warm rooms lỗi: ${e}`));
    return {
      started: true,
      note: 'Đang geocode nền (1 req/giây). Xem log server để biết tiến độ.',
    };
  }

  // Nhập toạ độ TỪ LINK MAPS trên bảng (nguồn chính xác nhất). Chạy đồng bộ vì
  // thường chỉ vài chục nhà; trả thống kê để nhân viên biết bao nhiêu nhà đã có.
  @Post('import-sheet-links')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  importSheetLinks() {
    return this.geocode.importFromMediaLinks();
  }

  // Nhân viên xác nhận/ghim toạ độ chính xác cho một phòng (nguồn 'manual').
  @Post('pin')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async pin(
    @Body() body: { roomCode: string; lat: number; lng: number },
  ): Promise<{ ok: boolean }> {
    await this.geocode.pinRoom(body.roomCode, body.lat, body.lng);
    return { ok: true };
  }

  // Phân giải một điểm mốc/địa chỉ (để nhân viên xác nhận khi AMBIGUOUS).
  @Post('resolve')
  resolve(@Body() body: { query: string }) {
    return this.geocode.resolve(body.query ?? '');
  }

  // Xem cache của một địa chỉ (không gọi mạng).
  @Get('cached')
  async cached(@Query('address') address: string) {
    return (await this.geocode.getCached(address ?? '')) ?? { status: null };
  }
}
