import { ConversationTurn, ExtractedInfo } from '@cba/shared';
import { deaccent } from '../../../common/vietnamese';
import { parseMoveIn, MoveInIntent } from './movein-parser';

// Hồ sơ NHU CẦU của khách, SUY RA mỗi lần gọi từ (ExtractedInfo đã merge CRM +
// hội thoại). Không lưu bảng riêng -> sống sót restart (tính lại), 2 hội thoại
// không trộn (mỗi request độc lập).

export type CoreSlot =
  | 'target_location'
  | 'budget'
  | 'move_in_date'
  | 'occupants';

export interface SlotProfile {
  targetLocation?: string;
  radiusKm?: number;
  budgetMin?: number;
  budgetMax?: number;
  moveInDate?: string;
  moveInIntent?: MoveInIntent;
  occupants?: number;
  requiredAmenities: string[];
  phone?: string;

  hasLocation: boolean;
  hasBudget: boolean;
  hasMoveIn: boolean;
  hasOccupants: boolean;

  /** Slot BOT (nhân viên) đã hỏi trong hội thoại -> không hỏi lại. */
  askedSlots: CoreSlot[];
}

/** Ghép các lượt của một vai (customer|staff) thành 1 chuỗi để dò. */
function joinRole(conv: ConversationTurn[], role: 'customer' | 'staff'): string {
  return conv
    .filter((t) => t.role === role)
    .map((t) => t.text)
    .join('\n');
}

/** Dò các slot mà BOT đã hỏi (để chống hỏi lại). */
export function detectAskedSlots(conv: ConversationTurn[]): CoreSlot[] {
  const asked = new Set<CoreSlot>();
  for (const t of conv) {
    if (t.role !== 'staff') continue;
    const s = deaccent(t.text);
    if (/khu vuc nao|khu nao|quanh khu|tuyen duong|dia diem nao|khu vuc, tuyen/.test(s))
      asked.add('target_location');
    if (/ngan sach|gia.*bao nhieu|bao nhieu.*thang|tien phong.*bao nhieu|tam bao nhieu/.test(s))
      asked.add('budget');
    if (/chuyen vao|don vao|khi nao.*vao|thoi gian.*vao|thoi gian chuyen/.test(s))
      asked.add('move_in_date');
    if (/bao nhieu nguoi|may nguoi|o may|du kien o.*nguoi/.test(s))
      asked.add('occupants');
  }
  return [...asked];
}

/**
 * Dựng SlotProfile. `info` đã là kết quả merge (CRM + extractor có parser tất
 * định). `now` inject được để test.
 */
export function buildSlotProfile(
  info: ExtractedInfo,
  conv: ConversationTurn[],
  now: Date = new Date(),
): SlotProfile {
  const targetLocation = info.targetLocation ?? info.area;
  // moveInIntent không nằm trong ExtractedInfo -> tính lại từ lời khách.
  const movein = parseMoveIn(joinRole(conv, 'customer'), now);

  const hasLocation = !!(targetLocation && targetLocation.trim());
  const hasBudget = !!(info.budgetMax || info.budgetMin);
  const hasMoveIn = !!(info.moveInDate || movein.moveInIntent);
  const hasOccupants = !!info.peopleCount;

  return {
    targetLocation: targetLocation ?? undefined,
    radiusKm: info.radiusKm,
    budgetMin: info.budgetMin,
    budgetMax: info.budgetMax,
    moveInDate: info.moveInDate ?? movein.moveInDate,
    moveInIntent: movein.moveInIntent,
    occupants: info.peopleCount,
    requiredAmenities: info.requirements ?? [],
    phone: info.phone,
    hasLocation,
    hasBudget,
    hasMoveIn,
    hasOccupants,
    askedSlots: detectAskedSlots(conv),
  };
}
