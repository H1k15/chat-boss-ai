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

// Chọn provider theo biến môi trường AI_PROVIDER. Dùng useFactory (đọc env
// LÚC KHỞI TẠO DI) thay vì đọc ở top-level: top-level chạy khi import module,
// lúc đó ConfigModule chưa nạp .env nên AI_PROVIDER còn undefined -> luôn rơi
// về Claude. Chỉ Docker (env set sẵn trước node) mới đúng; dev/node thì sai.
const llmProvider = {
  provide: LLM_PROVIDER,
  useFactory: (claude: ClaudeProvider, openai: OpenAiProvider) =>
    (process.env.AI_PROVIDER || 'claude') === 'openai' ? openai : claude,
  inject: [ClaudeProvider, OpenAiProvider],
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
  // LLM_PROVIDER export để SheetsModule dùng AI dò loại phòng (keyword bỏ sót).
  exports: [AiService, RoomMatcherService, LLM_PROVIDER],
})
export class AiModule {}
