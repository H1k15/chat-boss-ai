import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Channel } from '@cba/shared';

export class ConversationTurnDto {
  @IsString()
  role: 'customer' | 'staff';

  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  ts?: string;
}

export class AiSuggestDto {
  @IsString()
  facebookProfileId: string;

  @IsEnum(Channel)
  channel: Channel;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  conversation: ConversationTurnDto[];

  @IsOptional()
  postContext?: { text?: string; roomCodeGuess?: string };

  @IsOptional()
  @IsString()
  customerId?: string;
}
