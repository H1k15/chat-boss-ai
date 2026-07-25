import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import {
  LlmProvider,
  LlmJsonRequest,
  LlmMessage,
} from './llm-provider.interface';

// Provider OpenAI-compatible với CHUỖI DỰ PHÒNG (fallback chain).
//
// Cấu hình nhiều "tầng" model qua .env, thử theo thứ tự — tầng trên hết quota
// (429) hoặc lỗi thì tự nhảy xuống tầng dưới:
//   Tầng chính : OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL
//   Dự phòng   : OPENAI_FB2_* , OPENAI_FB3_* ... (đến FB6)
//
// Tầng cloud THIẾU KEY sẽ bị bỏ qua (để trống key = chưa bật) — tiện điền dần.
// Tầng local (localhost, VD Ollama) không cần key.
//
// Mỗi tầng có thể đặt:
//   *_REASONING_EFFORT = low|medium|high  (model reasoning như gpt-oss)
//   *_PROMPT_SUFFIX     = chuỗi ghép vào cuối system (VD "/no_think" cho qwen3)
interface Tier {
  client: OpenAI;
  model: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  promptSuffix?: string;
  label: string;
}

@Injectable()
export class OpenAiProvider implements LlmProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly tiers = this.buildTiers();

  private buildTiers(): Tier[] {
    const tiers: Tier[] = [];
    const add = (
      baseURL: string | undefined,
      apiKey: string | undefined,
      model: string | undefined,
      effort: string | undefined,
      suffix: string | undefined,
      label: string,
    ): void => {
      if (!model) return; // chưa cấu hình model -> bỏ tầng
      const isLocal = !!baseURL && /localhost|127\.0\.0\.1/.test(baseURL);
      if (!apiKey && !isLocal) return; // cloud thiếu key -> bỏ qua (bật khi có key)
      tiers.push({
        client: new OpenAI({
          apiKey: apiKey || 'not-needed-for-local',
          baseURL: baseURL || undefined,
          maxRetries: 1, // fail nhanh để nhảy tầng, không chờ lâu khi 429
        }),
        model,
        reasoningEffort: (effort as Tier['reasoningEffort']) || undefined,
        promptSuffix: suffix || undefined,
        label,
      });
    };

    // Tầng chính.
    add(
      process.env.OPENAI_BASE_URL,
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_MODEL || 'gpt-4o-mini',
      process.env.OPENAI_REASONING_EFFORT,
      process.env.OPENAI_PROMPT_SUFFIX,
      'chính',
    );
    // Các tầng dự phòng FB2..FB6.
    for (let n = 2; n <= 6; n++) {
      add(
        process.env[`OPENAI_FB${n}_BASE_URL`],
        process.env[`OPENAI_FB${n}_API_KEY`],
        process.env[`OPENAI_FB${n}_MODEL`],
        process.env[`OPENAI_FB${n}_REASONING_EFFORT`],
        process.env[`OPENAI_FB${n}_PROMPT_SUFFIX`],
        `dự phòng ${n}`,
      );
    }

    if (tiers.length) {
      this.logger.log(
        `LLM fallback chain: ${tiers
          .map((t) => `${t.label}(${t.model})`)
          .join(' -> ')}`,
      );
    } else {
      this.logger.warn('Chưa cấu hình tầng LLM nào (OPENAI_MODEL trống?)');
    }
    return tiers;
  }

  async completeJson<T = unknown>(req: LlmJsonRequest): Promise<T> {
    let lastErr: unknown;
    for (const tier of this.tiers) {
      try {
        const res = await tier.client.chat.completions.create({
          model: tier.model,
          max_tokens: req.maxTokens ?? 2048,
          messages: this.toMessages(req.system, req.messages, tier.promptSuffix),
          ...(tier.reasoningEffort
            ? { reasoning_effort: tier.reasoningEffort }
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
          throw new Error('bị cắt do chạm max_tokens — JSON không hoàn chỉnh');
        }
        const content = choice?.message?.content;
        if (!content) throw new Error('không trả về nội dung');
        return JSON.parse(content) as T;
      } catch (e) {
        lastErr = e;
        this.logger.warn(
          `LLM tầng "${tier.label}" (${tier.model}) lỗi -> thử tầng sau: ${String(e)}`,
        );
      }
    }
    throw new ServiceUnavailableException(
      `Tất cả tầng LLM đều lỗi. Lỗi cuối: ${String(lastErr)}`,
    );
  }

  async completeText(req: {
    system: string;
    messages: LlmMessage[];
    maxTokens?: number;
  }): Promise<string> {
    let lastErr: unknown;
    for (const tier of this.tiers) {
      try {
        const res = await tier.client.chat.completions.create({
          model: tier.model,
          max_tokens: req.maxTokens ?? 2048,
          messages: this.toMessages(req.system, req.messages, tier.promptSuffix),
          ...(tier.reasoningEffort
            ? { reasoning_effort: tier.reasoningEffort }
            : {}),
        });
        return res.choices[0]?.message?.content ?? '';
      } catch (e) {
        lastErr = e;
        this.logger.warn(
          `LLM tầng "${tier.label}" (text) lỗi -> thử tầng sau: ${String(e)}`,
        );
      }
    }
    throw new ServiceUnavailableException(
      `Tất cả tầng LLM đều lỗi. Lỗi cuối: ${String(lastErr)}`,
    );
  }

  private toMessages(
    system: string,
    messages: LlmMessage[],
    suffix?: string,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const sys = suffix ? `${system}\n${suffix}` : system;
    return [
      { role: 'system', content: sys },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ] as OpenAI.Chat.ChatCompletionMessageParam[];
  }
}
