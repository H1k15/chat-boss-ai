import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { IntentClassifierService } from './pipeline/intent-classifier.service';
import { InfoExtractorService } from './pipeline/info-extractor.service';
import { RoomMatcherService } from './pipeline/room-matcher.service';
import { ReplyGeneratorService } from './pipeline/reply-generator.service';
import { SafetyGuardService } from './pipeline/safety-guard.service';
import { LLM_PROVIDER } from './llm/llm-provider.interface';
import { ClaudeProvider } from './llm/claude.provider';
import { OpenAiProvider } from './llm/openai.provider';

// Chọn provider theo biến môi trường AI_PROVIDER.
const llmProvider = {
  provide: LLM_PROVIDER,
  useClass:
    (process.env.AI_PROVIDER || 'claude') === 'openai'
      ? OpenAiProvider
      : ClaudeProvider,
};

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    IntentClassifierService,
    InfoExtractorService,
    RoomMatcherService,
    ReplyGeneratorService,
    SafetyGuardService,
    ClaudeProvider,
    OpenAiProvider,
    llmProvider,
  ],
  // RoomMatcher là logic thuần DB (không LLM), cho module khác dùng lại được
  // — POST /rooms/match tái dùng đúng logic lọc phòng của pipeline.
  exports: [AiService, RoomMatcherService],
})
export class AiModule {}
