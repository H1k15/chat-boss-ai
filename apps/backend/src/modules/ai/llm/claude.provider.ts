import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  LlmProvider,
  LlmJsonRequest,
  LlmMessage,
} from './llm-provider.interface';

// Provider mặc định: Anthropic Claude.
//
// Dùng STRUCTURED OUTPUTS (`output_config.format`) để ép JSON đúng schema —
// API tự ràng buộc quá trình sinh token nên không cần "dặn" model trả JSON,
// cũng không cần lớp tool-use giả để lấy dữ liệu có cấu trúc.
//
// LƯU Ý QUAN TRỌNG: các model đời hiện tại (Sonnet 5, Opus 4.7/4.8...) đã BỎ
// tham số `temperature`/`top_p`/`top_k` — gửi lên là lỗi 400. Muốn điều chỉnh
// độ "sáng tạo" thì viết vào system prompt, không phải chỉnh sampling.
@Injectable()
export class ClaudeProvider implements LlmProvider {
  private readonly logger = new Logger(ClaudeProvider.name);
  private readonly client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 3, // SDK tự retry 429/5xx với exponential backoff
  });
  private readonly model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

  async completeJson<T = unknown>(req: LlmJsonRequest): Promise<T> {
    const res = await this.call(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 2048,
        system: req.system,
        // `schemaName` không đi vào payload của Claude (JSONOutputFormat chỉ
        // nhận `type` + `schema`); nó phục vụ OpenAiProvider, nơi json_schema
        // bắt buộc có tên.
        output_config: {
          format: { type: 'json_schema', schema: req.jsonSchema },
        },
        messages: this.toMessages(req.messages),
      }),
    );

    // Khi bị chặn vì lý do an toàn, output KHÔNG đảm bảo đúng schema.
    if (res.stop_reason === 'refusal') {
      throw new ServiceUnavailableException(
        `Model từ chối xử lý nội dung (${res.stop_details?.category ?? 'không rõ'})`,
      );
    }
    if (res.stop_reason === 'max_tokens') {
      throw new ServiceUnavailableException(
        'Model bị cắt giữa chừng do chạm max_tokens — JSON không hoàn chỉnh',
      );
    }

    const text = res.content.find((c) => c.type === 'text');
    if (!text || text.type !== 'text') {
      throw new ServiceUnavailableException('Claude không trả về nội dung text');
    }
    try {
      return JSON.parse(text.text) as T;
    } catch {
      this.logger.error(`JSON không parse được: ${text.text.slice(0, 400)}`);
      throw new ServiceUnavailableException('Claude trả về JSON không hợp lệ');
    }
  }

  async completeText(req: {
    system: string;
    messages: LlmMessage[];
    maxTokens?: number;
  }): Promise<string> {
    const res = await this.call(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 2048,
        system: req.system,
        messages: this.toMessages(req.messages),
      }),
    );
    const text = res.content.find((c) => c.type === 'text');
    return text && text.type === 'text' ? text.text : '';
  }

  // Chuẩn hoá lỗi SDK thành lỗi Nest để controller trả mã HTTP hợp lý,
  // thay vì để lỗi thô của nhà cung cấp rò ra ngoài API.
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) {
        this.logger.warn('Claude rate limit — đã hết lượt retry');
        throw new ServiceUnavailableException('AI đang quá tải, thử lại sau');
      }
      if (e instanceof Anthropic.APIConnectionError) {
        throw new ServiceUnavailableException('Không kết nối được tới AI');
      }
      if (e instanceof Anthropic.APIError) {
        this.logger.error(`Claude API lỗi ${e.status}: ${e.message}`);
        throw new ServiceUnavailableException('AI trả về lỗi');
      }
      throw e;
    }
  }

  private toMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
    return messages.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));
  }
}
