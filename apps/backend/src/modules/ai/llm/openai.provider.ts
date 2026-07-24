import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import {
  LlmProvider,
  LlmJsonRequest,
  LlmMessage,
} from './llm-provider.interface';

// Provider tuỳ chọn: OpenAI. Dùng json_schema response format (structured
// outputs) — cùng ràng buộc schema với ClaudeProvider nên schema dùng chung
// được, không cần viết hai bản.
//
// Đặt OPENAI_BASE_URL để trỏ vào server tương thích OpenAI chạy local
// (Ollama, LM Studio, vLLM...). Ví dụ Ollama: http://localhost:11434/v1
// Khi đó OPENAI_API_KEY chỉ cần một giá trị bất kỳ khác rỗng ("ollama").
@Injectable()
export class OpenAiProvider implements LlmProvider {
  private readonly client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'not-needed-for-local',
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    maxRetries: 3,
  });
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  // Mức suy luận cho model reasoning (VD gpt-oss trên Groq): low|medium|high.
  // Chỉ gửi khi có đặt — model thường (Ollama qwen2.5) không hiểu param này.
  private readonly reasoningEffort = process.env.OPENAI_REASONING_EFFORT as
    | 'low'
    | 'medium'
    | 'high'
    | undefined;

  async completeJson<T = unknown>(req: LlmJsonRequest): Promise<T> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 2048,
      messages: this.toMessages(req.system, req.messages),
      ...(this.reasoningEffort
        ? { reasoning_effort: this.reasoningEffort }
        : {}),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: req.schemaName,
          schema: req.jsonSchema,
          strict: true,
        },
      },
    });

    const choice = res.choices[0];
    if (choice?.finish_reason === 'length') {
      throw new ServiceUnavailableException(
        'Model bị cắt giữa chừng do chạm max_tokens — JSON không hoàn chỉnh',
      );
    }
    const content = choice?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException('OpenAI không trả về nội dung');
    }
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new ServiceUnavailableException('OpenAI trả về JSON không hợp lệ');
    }
  }

  async completeText(req: {
    system: string;
    messages: LlmMessage[];
    maxTokens?: number;
  }): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 2048,
      messages: this.toMessages(req.system, req.messages),
      ...(this.reasoningEffort
        ? { reasoning_effort: this.reasoningEffort }
        : {}),
    });
    return res.choices[0]?.message?.content ?? '';
  }

  private toMessages(
    system: string,
    messages: LlmMessage[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ] as OpenAI.Chat.ChatCompletionMessageParam[];
  }
}
