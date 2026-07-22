import { IsObject, IsOptional, IsString } from 'class-validator';

// Body cho PATCH /telegram/config — cập nhật từng phần.
export class TelegramConfigDto {
  @IsOptional()
  @IsString()
  defaultChatId?: string;

  // events: bật/tắt từng loại sự kiện, ví dụ { "APPOINTMENT": false }.
  // Không ràng buộc key chặt để thêm sự kiện mới không phải sửa DTO.
  @IsOptional()
  @IsObject()
  events?: Record<string, boolean>;
}
