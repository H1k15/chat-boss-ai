import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConversationTurnDto } from './ai-suggest.dto';

// Body cho POST /ai/extract — chỉ trích xuất, không sinh câu trả lời.
export class AiExtractDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  conversation: ConversationTurnDto[];

  @IsOptional()
  @IsString()
  customerId?: string;
}

// Body cho POST /ai/classify-comment — phân loại nhanh 1 comment.
export class AiClassifyCommentDto {
  @IsString()
  text: string;
}
