import { Body, Controller, Post, Req } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiSuggestDto } from './dto/ai-suggest.dto';
import { AiFeedbackDto } from './dto/ai-feedback.dto';
import { AiExtractDto, AiClassifyCommentDto } from './dto/ai-extract.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  // Endpoint extension gọi nhiều nhất.
  @Post('suggest')
  suggest(@Body() dto: AiSuggestDto, @Req() req: AuthenticatedRequest) {
    return this.ai.suggest(dto, req.user.userId);
  }

  // Nhân viên gửi thật -> ghi lại để ghép cặp "AI đề xuất -> người gửi".
  @Post('feedback')
  feedback(@Body() dto: AiFeedbackDto, @Req() req: AuthenticatedRequest) {
    return this.ai.recordSent(req.user.userId, dto);
  }

  // Chỉ trích xuất thông tin khách (không sinh câu trả lời).
  @Post('extract')
  extract(@Body() dto: AiExtractDto) {
    return this.ai.extractOnly(dto);
  }

  // Phân loại nhanh ý định của 1 comment.
  @Post('classify-comment')
  classifyComment(@Body() dto: AiClassifyCommentDto) {
    return this.ai.classifyComment(dto.text);
  }
}
