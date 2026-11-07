/**
 * Xuất cặp "AI đề xuất -> nhân viên gửi thật" ra JSONL để fine-tune.
 *
 * CHẠY:  pnpm --filter @cba/backend export:finetune
 * File ra: apps/backend/exports/finetune-YYYY-MM-DD.jsonl (đã gitignore vì
 * chứa tin nhắn khách thật — PII, KHÔNG commit, KHÔNG chia sẻ ra ngoài).
 *
 * Nối AI_SEND (câu người gửi) với AI_SUGGEST (ngữ cảnh + câu AI gợi ý) qua
 * suggestionLogId. Mục tiêu học: từ ngữ cảnh sinh ra câu NGƯỜI GỬI (không phải
 * câu AI gợi ý) — vì câu người gửi mới là chuẩn.
 *
 * Định dạng mỗi dòng gồm cả field gốc (để truy vết/phân tích) lẫn khối
 * `messages` dạng chat để nạp thẳng vào công cụ fine-tune. Prompt trong
 * `messages` là bản rút gọn — khi fine-tune thật nên dựng lại đúng system
 * prompt của reply-generator để khớp lúc chạy.
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { isUsableGoldReply } from '../src/modules/training/fb-history';

const prisma = new PrismaClient();

// Hình dạng meta đã ghi ở ai.service.ts (chỉ khai field ta đọc tới).
interface SuggestMeta {
  lastCustomerText?: string;
  intent?: string;
  suggestions?: string[];
  matchedRoomCodes?: string[];
}
interface SendMeta {
  suggestionLogId?: string;
  finalText?: string;
  chosenIndex?: number | null;
  edited?: boolean | null;
  // Gold pair nhập từ lịch sử Facebook (import:fb) — KHÔNG có suggestionLogId,
  // mà mang sẵn ngữ cảnh hội thoại + câu chủ trọ trả lời thật.
  source?: string;
  thread?: string;
  conversation?: { role: 'customer' | 'staff'; text: string }[];
}

function buildUserPrompt(m: SuggestMeta): string {
  const parts = [`Khách nói: ${m.lastCustomerText ?? ''}`];
  if (m.matchedRoomCodes?.length)
    parts.push(`Phòng phù hợp: ${m.matchedRoomCodes.join(', ')}`);
  return parts.join('\n');
}

async function main() {
  const sends = await prisma.activityLog.findMany({
    where: { action: 'AI_SEND' },
    orderBy: { createdAt: 'asc' },
  });

  const suggestIds = sends
    .map((s) => (s.meta as SendMeta | null)?.suggestionLogId)
    .filter((v): v is string => Boolean(v));
  const suggests = await prisma.activityLog.findMany({
    where: { id: { in: suggestIds } },
  });
  const suggestById = new Map(suggests.map((s) => [s.id, s]));

  const lines: string[] = [];
  let asIs = 0; // chèn gợi ý rồi gửi nguyên
  let edited = 0; // chèn rồi sửa
  let ownWritten = 0; // bỏ gợi ý, tự gõ
  let fbHistory = 0; // gold pair nhập từ lịch sử Facebook (đạt chất lượng)
  let fbSkipped = 0; // gold pair FB bị loại vì nhiễu/lạc đề

  for (const send of sends) {
    const sm = (send.meta as SendMeta | null) ?? {};

    // Gold pair FB (import) HOẶC thu thụ động (live_capture): dựng messages đa
    // lượt từ ngữ cảnh + câu chủ trọ (đích học). customer->user, staff->assistant.
    if (sm.source === 'fb_history_import' || sm.source === 'live_capture') {
      const conv = Array.isArray(sm.conversation) ? sm.conversation : [];
      const finalText = sm.finalText?.trim();
      if (!finalText || !conv.length) continue;
      // Bỏ câu nhiễu (tuyển dụng/chat cá nhân lọt vào thread) -> corpus sạch hơn.
      if (!isUsableGoldReply(finalText)) {
        fbSkipped++;
        continue;
      }
      fbHistory++;
      lines.push(
        JSON.stringify({
          source: 'fb_history',
          thread: sm.thread ?? null,
          messages: [
            ...conv.map((t) => ({
              role: t.role === 'customer' ? 'user' : 'assistant',
              content: t.text,
            })),
            { role: 'assistant', content: finalText },
          ],
        }),
      );
      continue;
    }

    const suggest = sm.suggestionLogId
      ? suggestById.get(sm.suggestionLogId)
      : undefined;
    if (!suggest) continue;
    const qm = (suggest.meta as SuggestMeta | null) ?? {};
    const finalText = sm.finalText?.trim();
    if (!finalText) continue;

    if (sm.chosenIndex == null) ownWritten++;
    else if (sm.edited) edited++;
    else asIs++;

    lines.push(
      JSON.stringify({
        // gốc — truy vết & phân tích
        customerText: qm.lastCustomerText ?? null,
        intent: qm.intent ?? null,
        rooms: qm.matchedRoomCodes ?? [],
        aiSuggested: qm.suggestions ?? [],
        chosenIndex: sm.chosenIndex ?? null,
        edited: sm.edited ?? null,
        // chat — nạp thẳng để fine-tune (đích là câu NGƯỜI GỬI)
        messages: [
          { role: 'user', content: buildUserPrompt(qm) },
          { role: 'assistant', content: finalText },
        ],
      }),
    );
  }

  const dir = join(__dirname, '..', 'exports');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = join(dir, `finetune-${stamp}.jsonl`);
  writeFileSync(file, lines.length ? lines.join('\n') + '\n' : '', 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Đã xuất ${lines.length} cặp -> ${file}`);
  // eslint-disable-next-line no-console
  console.table({
    'Dùng nguyên (AI đúng)': asIs,
    'Sửa lại (AI gần đúng)': edited,
    'Tự gõ (AI vô dụng)': ownWritten,
    'FB import + thu thụ động (đạt)': fbHistory,
    'Loại nhiễu': fbSkipped,
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
