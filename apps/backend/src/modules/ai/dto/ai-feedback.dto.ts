import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

// Body cho POST /ai/feedback — nhân viên báo đã gửi câu gì cho khách.
export class AiFeedbackDto {
  @IsString()
  suggestionLogId: string;

  @IsString()
  finalText: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  chosenIndex?: number;

  @IsOptional()
  @IsBoolean()
  edited?: boolean;
}
