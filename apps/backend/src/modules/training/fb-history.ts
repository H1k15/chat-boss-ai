// Lõi xử lý export "Download Your Information" (DYI) của Facebook -> CẶP VÀNG
// (ngữ cảnh hội thoại -> câu nhân viên thực sự gửi). Hàm THUẦN, test được, không
// đụng file/DB.

// FB DYI ghi chuỗi UTF-8 nhưng bị hiểu nhầm thành Latin-1 (mojibake, vd "Ä‘").
// Giải mã lại: đọc bytes theo latin1 rồi diễn giải UTF-8.
// CHỈ sửa khi chuỗi trông như latin1 (mọi ký tự <= 0xFF). Có ký tự > 0xFF nghĩa
// là Unicode THẬT (đã đúng) -> giữ nguyên, tránh giải mã lại làm hỏng.
export function fixMojibake(s: string): string {
  if (!s) return s;
  // Có ký tự > 0xFF -> Unicode thật, đã đúng -> giữ nguyên.
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0xff) return s;
  try {
    const decoded = Buffer.from(s, 'latin1').toString('utf8');
    // Giải mã ra U+FFFD nghĩa là byte KHÔNG phải UTF-8 hợp lệ -> chuỗi gốc vốn
    // đã đúng (vd tiếng Việt dùng à/ò/ù trong dải Latin-1) -> giữ nguyên.
    return decoded.includes('�') ? s : decoded;
  } catch {
    return s;
  }
}

export interface FbMessage {
  sender_name?: string;
  timestamp_ms?: number;
  content?: string;
}
export interface FbThread {
  participants?: { name?: string }[];
  messages?: FbMessage[];
  title?: string;
  thread_path?: string;
}

// ---- Đọc export định dạng HTML (khi người dùng chọn HTML thay vì JSON) ----
// FB DYI HTML: mỗi tin là <section class="_a6-g"> gồm <h2 class="_a6-h">Người gửi</h2>,
// <div class="_a6-p">nội dung</div>, <div class="_a72d">thời gian</div>.

// Bỏ thẻ HTML + giải một số entity + gộp khoảng trắng.
function stripHtml(s: string): string {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(+d))
    .replace(/\s+/g, ' ')
    .trim();
}

// "Mar 06, 2024 6:59:46 pm" -> ms (giờ địa phương, đủ để sắp thứ tự trong thread).
export function parseFbHtmlTime(s: string): number | undefined {
  if (!s) return undefined;
  const ms = new Date(s.replace(/\b([ap])m\b/i, (x) => x.toUpperCase())).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

// Lấy inner HTML của <div ... class="...marker..."> đầu tiên bằng đếm độ sâu div
// (nội dung tin có div lồng nhau).
function firstDivInnerByClass(html: string, marker: string): string {
  const open = new RegExp(`<div\\b[^>]*class="[^"]*${marker}[^"]*"[^>]*>`, 'i').exec(html);
  if (!open) return '';
  const start = open.index + open[0].length;
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 1;
  let t: RegExpExecArray | null;
  while ((t = tag.exec(html))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index);
  }
  return html.slice(start);
}

/** Parse một file message_*.html của FB DYI -> FbThread (cùng shape với JSON). */
export function parseFbHtmlThread(html: string): FbThread {
  const titleRaw = stripHtml(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const title = fixMojibake(titleRaw.replace(/^participants:\s*/i, '')) || undefined;
  const blocks = html.split(/class="_a6-g"/).slice(1); // mỗi khối = 1 tin
  const messages: FbMessage[] = [];
  for (const b of blocks) {
    const sender = fixMojibake(stripHtml(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(b)?.[1] ?? ''));
    const content = fixMojibake(stripHtml(firstDivInnerByClass(b, '_a6-p')));
    const timeText = stripHtml(
      /<div\b[^>]*class="[^"]*_a72d[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(b)?.[1] ?? '',
    );
    messages.push({
      sender_name: sender || undefined,
      content: content || undefined,
      timestamp_ms: parseFbHtmlTime(timeText),
    });
  }
  return { title, messages };
}

// Tin "hệ thống"/boilerplate do Facebook chèn (không phải người gõ) -> loại khỏi
// gold pair để tránh gán nhầm thành câu nhân viên.
const NOISE_PATTERNS: RegExp[] = [
  /you can now message and call each other/i,
  /you are now connected on messenger/i,
  /sent an attachment/i,
  /sent a photo/i,
  /sent a sticker/i,
  /sent a link/i,
  /sent a voice message/i,
  /(started|missed|ended) (a |your |the )?(video )?call/i,
  /\bcalled you\b/i,
  /reacted .*(to your message|to a message)/i,
  /named the (group|conversation)/i,
  /set (the|your|his|her|their) nickname/i,
  /set the (emoji|chat theme|theme|photo)/i,
  /changed the (group|chat) (photo|name|theme)/i,
  /(left|joined) the group/i,
  /added .* to the (group|conversation)/i,
  /removed .* from the (group|conversation)/i,
  /waved (hello )?at/i,
  /poll:/i,
  /liked a message/i,
];
export function isNoiseContent(s?: string): boolean {
  if (!s) return true;
  const t = s.trim();
  if (!t) return true;
  return NOISE_PATTERNS.some((re) => re.test(t));
}

export interface GoldTurn {
  role: 'customer' | 'staff';
  text: string;
  ts?: string;
}
export interface GoldPair {
  thread: string;
  conversation: GoldTurn[]; // ngữ cảnh TRƯỚC câu nhân viên gửi
  reply: string; // câu nhân viên thực sự gửi
  ts?: string;
}

// Đếm số lần mỗi người xuất hiện làm sender trên NHIỀU thread -> người tư vấn
// (chủ tài khoản) là người xuất hiện ở nhiều thread nhất.
export function guessStaffName(threads: FbThread[]): string | undefined {
  const perThread = new Map<string, number>();
  for (const t of threads) {
    const names = new Set<string>();
    for (const m of t.messages ?? []) if (m.sender_name) names.add(m.sender_name);
    for (const n of names) perThread.set(n, (perThread.get(n) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [n, c] of perThread) if (c > bestCount) ((best = n), (bestCount = c));
  return best ? fixMojibake(best) : undefined;
}

/**
 * Trích cặp vàng từ MỘT thread. Mỗi câu của NHÂN VIÊN (staffName) đứng sau ≥1
 * lượt khách -> một cặp {ngữ cảnh trước đó -> câu nhân viên}. Bỏ tin không có
 * chữ (ảnh/file/chia sẻ). Ngữ cảnh cắt còn tối đa maxContext lượt gần nhất.
 */
export function buildGoldPairs(
  thread: FbThread,
  staffName: string,
  maxContext = 12,
): GoldPair[] {
  const title = fixMojibake(thread.title || thread.thread_path || 'thread');
  const staff = staffName;
  // FB DYI xếp tin mới nhất trước -> đảo về thứ tự thời gian.
  const msgs = [...(thread.messages ?? [])]
    .filter((m) => typeof m.content === 'string' && !isNoiseContent(m.content))
    .sort((a, b) => (a.timestamp_ms ?? 0) - (b.timestamp_ms ?? 0));

  const pairs: GoldPair[] = [];
  const convo: GoldTurn[] = [];
  let sawCustomer = false;

  for (const m of msgs) {
    const isStaff = fixMojibake(m.sender_name ?? '') === fixMojibake(staff);
    const text = fixMojibake(m.content as string).trim();
    const ts = m.timestamp_ms ? new Date(m.timestamp_ms).toISOString() : undefined;

    if (isStaff) {
      // Chỉ lấy cặp khi đã có ít nhất một lượt khách trước đó.
      if (sawCustomer && convo.length) {
        pairs.push({
          thread: title,
          conversation: convo.slice(-maxContext),
          reply: text,
          ts,
        });
      }
      convo.push({ role: 'staff', text, ts });
    } else {
      sawCustomer = true;
      convo.push({ role: 'customer', text, ts });
    }
  }
  return pairs;
}
