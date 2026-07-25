/**
 * PHÂN TÍCH LOG hội thoại để biết cần "train" (sửa rule/prompt) chỗ nào.
 *
 * CHẠY:  pnpm --filter @cba/backend analyze:logs
 *   (tuỳ chọn số ngày gần nhất: analyze:logs -- 14)
 *
 * Đọc AI_SUGGEST + AI_SEND + SAFETY_BLOCK trong activity_logs, tổng hợp:
 *  - Tỉ lệ AI đúng / gần đúng / vô dụng (dựa câu NV gửi thật).
 *  - Phân bố next_action (stage machine).
 *  - Số lần fallback template / bị SafetyGuard chặn + lý do.
 *  - Ca "extractor có thể bỏ sót" (bot hỏi khu/giá mà câu khách trông đã có).
 *  - Top câu khách khiến AI vô dụng (NV tự gõ) -> ca cần sửa rule/prompt.
 *
 * Xuất review JSONL: exports/review-cases-YYYY-MM-DD.jsonl (PII -> gitignore).
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

interface SuggestMeta {
  lastCustomerText?: string;
  intent?: string;
  action?: string;
  nextAction?: string;
  knownSlots?: string[];
  missingSlots?: string[];
  fallbackUsed?: boolean;
  blocked?: boolean;
  matchedRoomCodes?: string[];
}
interface SendMeta {
  suggestionLogId?: string;
  finalText?: string;
  chosenIndex?: number | null;
  edited?: boolean | null;
}

const inc = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);
// Câu khách trông đã có khu vực / ngân sách (heuristic để nghi extractor sót).
const looksLikeBudget = (s: string) => /(trieu|tr\b|cu\b|\d\s*tr)/i.test(s);
const looksLikeArea = (s: string) =>
  /(quan|phuong|duong|ngo|khu|gan |quanh )/i.test(
    s.normalize('NFD').replace(/[̀-ͯ]/g, ''),
  );

async function main() {
  const days = Number(process.argv[2]) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await prisma.activityLog.findMany({
    where: {
      action: { in: ['AI_SUGGEST', 'AI_SEND', 'SAFETY_BLOCK'] },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
  });

  const suggests = logs.filter((l) => l.action === 'AI_SUGGEST');
  const sends = logs.filter((l) => l.action === 'AI_SEND');
  const blocks = logs.filter((l) => l.action === 'SAFETY_BLOCK');
  const byId = new Map(suggests.map((s) => [s.id, s]));

  const actionDist: Record<string, number> = {};
  let fallback = 0;
  let extractorSuspect = 0;
  const suspectSamples: string[] = [];
  for (const s of suggests) {
    const m = (s.meta as SuggestMeta | null) ?? {};
    if (m.action) inc(actionDist, m.action);
    if (m.fallbackUsed) fallback++;
    // Bot đòi khu/giá nhưng câu khách trông đã có -> nghi extractor sót.
    const txt = m.lastCustomerText ?? '';
    if (
      (m.action === 'ASK_LOCATION' && looksLikeArea(txt)) ||
      (m.action === 'ASK_BUDGET' && looksLikeBudget(txt)) ||
      (m.action === 'ASK_LOCATION_AND_BUDGET' &&
        (looksLikeArea(txt) || looksLikeBudget(txt)))
    ) {
      extractorSuspect++;
      if (suspectSamples.length < 15) suspectSamples.push(`[${m.action}] ${txt}`);
    }
  }

  let asIs = 0;
  let edited = 0;
  let ownWritten = 0;
  const uselessTexts: Record<string, number> = {};
  const review: string[] = [];
  for (const send of sends) {
    const sm = (send.meta as SendMeta | null) ?? {};
    const suggest = sm.suggestionLogId ? byId.get(sm.suggestionLogId) : undefined;
    const qm = (suggest?.meta as SuggestMeta | null) ?? {};
    if (sm.chosenIndex == null) {
      ownWritten++;
      const key = (qm.lastCustomerText ?? '').slice(0, 60);
      if (key) inc(uselessTexts, key);
      review.push(
        JSON.stringify({
          type: 'own_written',
          customerText: qm.lastCustomerText ?? null,
          action: qm.action ?? null,
          finalText: sm.finalText ?? null,
        }),
      );
    } else if (sm.edited) edited++;
    else asIs++;
  }

  const blockReasons: Record<string, number> = {};
  for (const b of blocks) {
    const reasons = ((b.meta as { reasons?: string[] } | null)?.reasons) ?? [];
    for (const r of reasons) inc(blockReasons, r.split('—')[0].trim());
    review.push(
      JSON.stringify({ type: 'safety_block', reasons, at: b.createdAt }),
    );
  }

  // ---- In báo cáo ----
  const line = (s: string) => console.log(s); // eslint-disable-line no-console
  line(`\n=== PHÂN TÍCH LOG ${days} ngày gần nhất ===`);
  line(`AI_SUGGEST: ${suggests.length} | AI_SEND: ${sends.length} | SAFETY_BLOCK: ${blocks.length}`);
  const total = asIs + edited + ownWritten || 1;
  line(`\nChất lượng gợi ý (theo câu NV gửi thật):`);
  line(`  Dùng nguyên (AI đúng)   : ${asIs} (${((asIs / total) * 100).toFixed(0)}%)`);
  line(`  Sửa lại (AI gần đúng)   : ${edited} (${((edited / total) * 100).toFixed(0)}%)`);
  line(`  Tự gõ (AI vô dụng)      : ${ownWritten} (${((ownWritten / total) * 100).toFixed(0)}%)`);
  line(`\nfallback template: ${fallback} | nghi extractor sót: ${extractorSuspect}`);
  line(`\nPhân bố next_action:`);
  Object.entries(actionDist).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => line(`  ${k}: ${v}`));
  if (Object.keys(blockReasons).length) {
    line(`\nLý do SafetyGuard chặn:`);
    Object.entries(blockReasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => line(`  ${k}: ${v}`));
  }
  if (suspectSamples.length) {
    line(`\nCa nghi extractor sót (sửa rule parser):`);
    suspectSamples.forEach((s) => line(`  ${s}`));
  }
  const topUseless = Object.entries(uselessTexts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topUseless.length) {
    line(`\nTop câu khách khiến AI vô dụng (NV tự gõ):`);
    topUseless.forEach(([k, v]) => line(`  (${v}x) ${k}`));
  }

  const dir = join(__dirname, '..', 'exports');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `review-cases-${new Date().toISOString().slice(0, 10)}.jsonl`);
  writeFileSync(file, review.length ? review.join('\n') + '\n' : '', 'utf8');
  line(`\nĐã ghi ${review.length} ca cần review -> ${file}\n`);
}

main()
  .catch((e) => {
    console.error(e); // eslint-disable-line no-console
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
