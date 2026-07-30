/**
 * Nạp CẶP VÀNG từ export "Download Your Information" (DYI) của Facebook vào DB.
 * Mỗi câu nhân viên thực sự đã gửi (đứng sau lượt khách) -> 1 dòng activity_logs
 * action=AI_SEND, meta.source='fb_history_import' (phân biệt với AI_SEND thật).
 *
 * Xuất DYI: Facebook > Settings > Download your information > chọn Messages,
 * định dạng JSON. Giải nén ra một thư mục.
 *
 * Chạy (từ apps/backend, đường dẫn kiểu Windows C:/... để Node hiểu):
 *   npx dotenv -e ../../.env -- ts-node prisma/import-fb-history.ts "C:/.../DYI" --dry
 *   (bỏ --dry để ghi thật). Tuỳ chọn: --staff "Tên NV" --org <id> --max N
 *
 * --dry: chỉ đếm + in vài ví dụ, KHÔNG ghi DB. LUÔN chạy --dry trước để kiểm tra
 * parser đọc đúng tên nhân viên + tiếng Việt không bị lỗi mã hoá.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  buildGoldPairs,
  guessStaffName,
  parseFbHtmlThread,
  FbThread,
} from '../src/modules/training/fb-history';

const DEFAULT_ORG_ID = 'org_seed_default';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const root = process.argv[2];
const staffArg = arg('--staff');
const orgId = arg('--org') || DEFAULT_ORG_ID;
const dry = process.argv.includes('--dry');
const rentalOnly = process.argv.includes('--rental');
const max = Number(arg('--max') || 0);

// Tín hiệu "hội thoại tư vấn nhà trọ". Dùng khi --rental để loại thread mua hàng/
// chat cá nhân (nơi chủ tài khoản đóng vai KHÁCH -> gold pair sai vai, gây nhiễu).
const RENTAL_TERMS = [
  'nhà trọ', 'phòng trọ', 'thuê phòng', 'còn phòng', 'phòng trống', 'xem phòng',
  'giá phòng', 'tiền phòng', 'tiền cọc', 'đặt cọc', 'điện nước', 'ở ghép',
  'khép kín', 'gác lửng', 'gác xép', 'chung cư mini', 'ký túc', 'dọn vào',
  'đặt phòng', 'thuê trọ', 'mét vuông', 'wc riêng', 'vệ sinh khép kín',
];
function isRentalThread(t: FbThread): boolean {
  const text = (t.messages ?? [])
    .map((m) => (m.content ?? '').toLowerCase())
    .join(' \n ');
  let hits = 0;
  for (const term of RENTAL_TERMS) if (text.includes(term)) hits++;
  return hits >= 2; // cần ≥2 tín hiệu để chắc là hội thoại nhà trọ
}

// Duyệt đệ quy, gom các message_*.json theo thư mục (thread bị chia nhiều file).
function findThreadDirs(dir: string, out: Map<string, string[]>): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) findThreadDirs(p, out);
    else if (/^message_\d+\.(json|html)$/i.test(e) && /messages/i.test(dir)) {
      const list = out.get(dir) ?? [];
      list.push(p);
      out.set(dir, list);
    }
  }
}

function loadThread(files: string[]): FbThread {
  const merged: FbThread = { messages: [] };
  for (const f of files) {
    try {
      const raw = readFileSync(f, 'utf8');
      // Định dạng HTML (người dùng chọn HTML thay vì JSON) parse riêng.
      const j = /\.html$/i.test(f)
        ? parseFbHtmlThread(raw)
        : (JSON.parse(raw) as FbThread);
      if (!merged.title && j.title) merged.title = j.title;
      if (!merged.participants && j.participants) merged.participants = j.participants;
      if (Array.isArray(j.messages)) merged.messages!.push(...j.messages);
    } catch {
      /* file hỏng -> bỏ */
    }
  }
  return merged;
}

async function main() {
  if (!root) {
    // eslint-disable-next-line no-console
    console.error('Thiếu đường dẫn thư mục DYI. Xem hướng dẫn ở đầu file.');
    process.exit(1);
  }
  const dirMap = new Map<string, string[]>();
  findThreadDirs(root, dirMap);
  let threads = [...dirMap.values()].map(loadThread).filter((t) => t.messages?.length);
  // eslint-disable-next-line no-console
  console.log(`Tìm thấy ${threads.length} hội thoại.`);
  if (rentalOnly) {
    const before = threads.length;
    threads = threads.filter(isRentalThread);
    // eslint-disable-next-line no-console
    console.log(`--rental: giữ ${threads.length}/${before} hội thoại có tín hiệu nhà trọ.`);
  }
  if (!threads.length) {
    console.log('Không có hội thoại nào (kiểm tra đường dẫn có thư mục messages/inbox).');
    process.exit(0);
  }

  const staff = staffArg || guessStaffName(threads);
  // eslint-disable-next-line no-console
  console.log(`Nhân viên (staff) = "${staff}"${staffArg ? '' : ' (tự đoán — sai thì dùng --staff)'}`);
  if (!staff) process.exit(1);

  let pairs = threads.flatMap((t) => buildGoldPairs(t, staff));
  if (max > 0) pairs = pairs.slice(0, max);
  // eslint-disable-next-line no-console
  console.log(`Trích được ${pairs.length} CẶP VÀNG (ngữ cảnh -> câu NV gửi).`);
  // Vài ví dụ để kiểm tra encoding/parse.
  for (const p of pairs.slice(0, 3)) {
    console.log('  ---', p.thread);
    console.log('   ctx:', p.conversation.slice(-2).map((t) => `${t.role}:${t.text}`).join(' | '));
    console.log('   NV :', p.reply);
  }

  if (dry) {
    console.log('\n[DRY] Không ghi DB. Bỏ --dry để nạp thật.');
    return;
  }

  const prisma = new PrismaClient();
  const BATCH = 500;
  let imported = 0;
  for (let i = 0; i < pairs.length; i += BATCH) {
    const slice = pairs.slice(i, i + BATCH);
    await prisma.activityLog.createMany({
      data: slice.map((p) => ({
        action: 'AI_SEND',
        organizationId: orgId,
        entity: `fb_thread:${p.thread}`.slice(0, 200),
        meta: {
          source: 'fb_history_import',
          aiSuggested: false,
          thread: p.thread,
          conversation: p.conversation,
          finalText: p.reply,
        } as unknown as Prisma.InputJsonObject,
        ...(p.ts ? { createdAt: new Date(p.ts) } : {}),
      })),
    });
    imported += slice.length;
  }
  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log(`\nĐã nạp ${imported} cặp vàng vào activity_logs (org ${orgId}).`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
