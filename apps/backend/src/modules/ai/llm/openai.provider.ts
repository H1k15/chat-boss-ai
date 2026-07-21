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
@Injectable()
export class OpenAiProvider implements LlmProvider {
  private readonly client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
  });
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  async completeJson<T = unknown>(req: LlmJsonRequest): Promise<T> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 2048,
      messages: this.toMessages(req.system, req.messages),
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
