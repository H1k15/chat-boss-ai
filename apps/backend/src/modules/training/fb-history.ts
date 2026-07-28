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
    .filter((m) => typeof m.content === 'string' && m.content.trim())
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
