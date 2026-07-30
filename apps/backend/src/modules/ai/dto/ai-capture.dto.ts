import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ConversationTurnDto } from './ai-suggest.dto';

// Body cho POST /ai/capture — thu THỤ ĐỘNG câu nhân viên vừa gửi (kèm ngữ cảnh)
// làm cặp vàng, KHÔNG cần bấm "Gợi ý" trước. conversation kết thúc bằng lượt của
// nhân viên (câu vừa gửi).
export class AiCaptureDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  conversation: ConversationTurnDto[];
}
