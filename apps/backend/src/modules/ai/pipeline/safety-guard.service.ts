import { Injectable } from '@nestjs/common';
import { MatchedRoom } from '@cba/shared';
import { deaccent } from '../../../common/vietnamese';

/** Câu hỏi lại an toàn, dùng khi mọi gợi ý đều bị chặn. */
const FALLBACK_SUGGESTION =
  'Dạ anh/chị cho em xin khu vực muốn thuê và ngân sách khoảng bao nhiêu để em lọc phòng phù hợp gửi mình nhé.';

/** Độ dài tối đa một tin nhắn tư vấn hợp lý. */
const MAX_LENGTH = 600;

export interface SafetyCheckResult {
  blocked: boolean;
  reasons: string[];
  safeSuggestions: string[];
}

/**
 * [5] Kiểm tra an toàn nội dung TRƯỚC KHI hiển thị gợi ý cho nhân viên.
 *
 * Đây là tuyến phòng thủ THỨ HAI cho yêu cầu số 1 của dự án — "AI không bịa
 * thông tin phòng". Tuyến thứ nhất là system prompt; nhưng prompt chỉ là lời
 * dặn, model vẫn có thể trượt. Ở đây ta đối chiếu MÁY MÓC từng con số tiền và
 * từng mã phòng trong câu trả lời với dữ liệu phòng thật do RoomMatcher lọc ra.
 * Cái gì không truy được về dữ liệu thật thì chặn.
 */
@Injectable()
export class SafetyGuardService {
  check(suggestions: string[], matchedRooms: MatchedRoom[]): SafetyCheckResult {
    const reasons: string[] = [];
    const allowedAmounts = this.buildAllowedAmounts(matchedRooms);
    const allowedCodes = new Set(
      matchedRooms.map((r) => r.roomCode.toUpperCase()),
    );

    const safeSuggestions = suggestions.filter((s) => {
      const reason = this.violation(s, allowedAmounts, allowedCodes);
      if (reason) {
        reasons.push(reason);
        return false;
      }
      return true;
    });

    return {
      blocked: safeSuggestions.length === 0 && suggestions.length > 0,
      reasons,
      safeSuggestions: safeSuggestions.length
        ? safeSuggestions
        : [FALLBACK_SUGGESTION],
    };
  }

  /**
   * Kiểm tra 1 tin nhắn do orchestrator sinh: ngoài giá/SĐT/mã phòng, còn chặn
   * (a) hỏi lại slot ĐÃ BIẾT, (b) khan hiếm giả / cam kết giữ phòng-giảm giá.
   * Không sửa message; ai.service sẽ thay bằng template khi blocked.
   */
  checkOrchestrated(
    message: string,
    rooms: MatchedRoom[],
    knownSlots: string[],
  ): { blocked: boolean; reasons: string[]; safeMessage: string } {
    const reasons: string[] = [];
    const allowedAmounts = this.buildAllowedAmounts(rooms);
    const allowedCodes = new Set(rooms.map((r) => r.roomCode.toUpperCase()));

    const v = this.violation(message, allowedAmounts, allowedCodes);
    if (v) reasons.push(v);
    const reask = this.reAsksKnownSlot(message, knownSlots);
    if (reask) reasons.push(reask);
    const fake = this.fakeUrgencyOrCommitment(message);
    if (fake) reasons.push(fake);

    return { blocked: reasons.length > 0, reasons, safeMessage: message };
  }

  /** Câu trả lời hỏi lại một slot đã biết -> vi phạm (mục XIII.9). */
  private reAsksKnownSlot(text: string, knownSlots: string[]): string | null {
    const s = deaccent(text);
    const patterns: Record<string, RegExp> = {
      target_location: /khu vuc nao|khu nao|tim quanh khu nao|o khu nao|tuyen duong nao|dia diem nao/,
      budget: /ngan sach.*bao nhieu|gia.*bao nhieu|tam bao nhieu|bao nhieu.*thang/,
      move_in_date: /khi nao.*chuyen vao|thoi gian.*chuyen vao|chuyen vao.*khi nao|du kien.*vao khi/,
      occupants: /bao nhieu nguoi|may nguoi o/,
    };
    for (const slot of knownSlots) {
      if (patterns[slot]?.test(s)) {
        return `Hỏi lại slot đã biết (${slot}) — chặn`;
      }
    }
    return null;
  }

  /** Khan hiếm giả / cam kết giữ phòng, giảm giá (mục XIII.7-8). */
  private fakeUrgencyOrCommitment(text: string): string | null {
    const s = deaccent(text);
    if (
      /nhieu (nguoi|khach) (dang )?(hoi|quan tam|xem|hoi thue)|sap het phong|nhanh keo het|chi con \d+ phong|nhanh tay/.test(
        s,
      )
    ) {
      return 'Tạo khan hiếm giả — chặn';
    }
    if (
      /giu phong cho|giu cho ban|giam gia cho ban|bot gia cho|khuyen mai rieng|uu dai rieng cho ban/.test(
        s,
      )
    ) {
      return 'Cam kết giữ phòng/giảm giá — chặn';
    }
    return null;
  }

  /** Trả về lý do chặn, hoặc null nếu gợi ý an toàn. */
  private violation(
    s: string,
    allowedAmounts: Set<number>,
    allowedCodes: Set<string>,
  ): string | null {
    // 1) Không để lộ số điện thoại (của khách khác, hoặc số bịa).
    if (this.containsPhone(s)) {
      return 'Gợi ý chứa số điện thoại — chặn để tránh lộ dữ liệu';
    }

    // 2) Mọi con số tiền phải truy được về một phòng có thật.
    for (const amount of this.extractAmounts(s)) {
      if (!allowedAmounts.has(amount)) {
        return `Nêu giá ${amount.toLocaleString('vi-VN')}đ không khớp phòng nào trong dữ liệu — chặn để tránh bịa`;
      }
    }

    // 3) Mã phòng nhắc tới phải nằm trong danh sách đã lọc.
    for (const code of this.extractRoomCodes(s)) {
      if (!allowedCodes.has(code)) {
        return `Nhắc mã phòng ${code} không có trong dữ liệu đã lọc — chặn để tránh bịa`;
      }
    }

    // 4) Chặn câu quá dài (dấu hiệu lan man, không giống nhân viên thật).
    if (s.length > MAX_LENGTH) {
      return 'Gợi ý quá dài — chặn';
    }

    return null;
  }

  /**
   * Tập giá được phép nhắc tới.
   *
   * Ngoài giá đúng, ta chấp nhận cả bản làm tròn tới 100 nghìn và tới triệu —
   * vì cách nói tự nhiên "phòng hơn 3 triệu" cho phòng 3.800.000 là đúng chứ
   * không phải bịa. Việc nới này không mở đường cho bịa đặt: một con số không
   * bắt nguồn từ phòng nào (ví dụ "5 triệu" khi kho chỉ có 3.6–4tr) vẫn rớt.
   */
  private buildAllowedAmounts(rooms: MatchedRoom[]): Set<number> {
    const allowed = new Set<number>();
    for (const r of rooms) {
      allowed.add(r.price);
      allowed.add(Math.round(r.price / 100_000) * 100_000);
      allowed.add(Math.floor(r.price / 1_000_000) * 1_000_000);
      allowed.add(Math.ceil(r.price / 1_000_000) * 1_000_000);
      // Giá dịch vụ (điện/nước/mạng/máy giặt...) NẰM TRONG dữ liệu thật của
      // phòng -> AI được phép nhắc lại. extractAmounts chỉ nhận số DẠNG TIỀN
      // ("4k", "60k"), bỏ qua "1 điều hòa"/"2 người", nên không mở đường bịa
      // giá thuê (giá thuê tiền triệu, giá dịch vụ tiền nghìn — khác bậc).
      for (const a of this.extractAmounts(
        `${r.furniture ?? ''} ${r.note ?? ''}`,
      )) {
        allowed.add(a);
      }
    }
    return allowed;
  }

  private containsPhone(s: string): boolean {
    return /(?<!\d)(0|\+84|84)[\s.]?[35789]([\s.]?\d){8}(?!\d)/.test(s);
  }

  /** Mã phòng dạng P001, A12... (một chữ cái + 2-4 chữ số). */
  private extractRoomCodes(s: string): string[] {
    return (s.toUpperCase().match(/\b[A-Z]\d{2,4}\b/g) ?? []).map((c) => c);
  }

  /**
   * Rút mọi con số TIỀN trong câu, quy về VND.
   *
   * Chỉ nhận số có dấu hiệu tiền tệ ("tr", "triệu", "k", dấu phân cách nghìn,
   * hoặc >= 6 chữ số). Nhờ vậy "20m2", "2 người", "17h" không bị hiểu nhầm
   * thành giá và gây chặn oan.
   */
  extractAmounts(s: string): number[] {
    const amounts: number[] = [];
    // Phần thập phân sau "triệu" bị bỏ qua nếu con số đó thực ra là lượng từ
    // của một đơn vị khác — "3 triệu 2 người ở" là 3.000.000 cho 2 người,
    // không phải 3.200.000.
    // "triệu" phải đứng TRƯỚC "tr" trong nhánh alternation: regex chọn nhánh
    // khớp đầu tiên chứ không phải nhánh dài nhất, nên để "tr" trước thì
    // "3 triệu 5" chỉ khớp "tr" rồi bỏ lại "iệu 5" và ra 3.000.000.
    const re =
      /(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr)(?:\s*(\d{1,3})(?!\s*(?:người|nguoi|phòng|phong|tháng|thang|năm|nam|m2|giờ|gio|tuổi|tuoi)))?|(\d{1,3}(?:\.\d{3})+)|(\d+)\s*k(?![\p{L}])|(\d{6,})/giu;

    for (const m of s.matchAll(re)) {
      const [, millions, millionFrac, separated, thousands, plain] = m;

      if (millions !== undefined) {
        let value = parseFloat(millions.replace(',', '.')) * 1_000_000;
        if (millionFrac) {
          // "3tr8" -> 800.000 ; "3tr50" -> 500.000 ; "3tr500" -> 500.000
          value += Number(millionFrac) * 10 ** (5 - millionFrac.length + 1);
        }
        amounts.push(Math.round(value));
      } else if (separated !== undefined) {
        amounts.push(Number(separated.replace(/\./g, '')));
      } else if (thousands !== undefined) {
        amounts.push(Number(thousands) * 1_000);
      } else if (plain !== undefined) {
        amounts.push(Number(plain));
      }
    }
    return amounts;
  }
}
