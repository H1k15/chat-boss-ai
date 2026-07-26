import { deaccent } from '../../common/vietnamese';

// Bóc yêu cầu KHOẢNG CÁCH từ câu khách BẰNG CODE (regex tất định) — không giao
// việc tính toán cho model. Chỉ TRÍCH các tham số; việc lọc/tính km làm ở matcher
// bằng Haversine.
//
// Bắt được các kiểu nói:
//   "trong bán kính 3 km"        -> radiusKm = 3
//   "cách không quá 2 km"        -> maxDistanceKm = 2, requirement = within
//   "gần Đại học ..."            -> requirement = near
//   "quanh khu vực ..."          -> requirement = around
//   "đi xe máy khoảng 10 phút"   -> transportMode = motorbike, maxDistanceKm suy ra

export type DistanceRequirement = 'within' | 'near' | 'around' | 'none';
export type TransportMode = 'walk' | 'motorbike' | 'car' | 'unknown';

export interface DistanceQuery {
  targetLocation?: string; // nơi lấy làm tâm (nếu bóc được từ câu)
  radiusKm?: number; // "bán kính N km"
  maxDistanceKm?: number; // "cách không quá N km" hoặc suy từ thời gian đi lại
  distanceRequirement: DistanceRequirement;
  transportMode?: TransportMode;
  derivedFromMinutes?: number; // >0 nếu maxDistanceKm suy ra từ "N phút"
}

// Vận tốc trung bình nội đô (km/h) để đổi "N phút" -> km. Đây là GIẢ ĐỊNH tất
// định, khai báo công khai (không phải model đoán). Cố tình lấy thấp cho an toàn.
const SPEED_KMH: Record<TransportMode, number> = {
  walk: 4.5,
  motorbike: 18,
  car: 22,
  unknown: 15,
};

/** Có ràng buộc khoảng cách bằng SỐ (đáng để geocode + lọc theo bán kính). */
export function hasNumericConstraint(q: DistanceQuery): boolean {
  return typeof q.radiusKm === 'number' || typeof q.maxDistanceKm === 'number';
}

function detectTransport(t: string): TransportMode | undefined {
  if (/\bdi bo\b|di bo /.test(t)) return 'walk';
  if (/xe may|xe gan may|grab bike|grabbike|xe om/.test(t)) return 'motorbike';
  if (/o to|xe hoi|xe con|taxi|grab car|di xe hoi/.test(t)) return 'car';
  return undefined;
}

/** Đổi "N <đơn vị>" về km. Hỗ trợ km và m/mét. */
function toKm(value: number, unit: string): number {
  return /^m(et|ét)?$/.test(unit) ? value / 1000 : value;
}

export function parseDistanceQuery(text: string): DistanceQuery {
  const t = deaccent(text); // bỏ dấu để regex ổn định
  const q: DistanceQuery = { distanceRequirement: 'none' };

  // 1) Bán kính: "bán kính (khoảng) N km/m"
  const rad = t.match(
    /ban kinh\s*(?:khoang\s*)?(\d+(?:[.,]\d+)?)\s*(km|m|met)/,
  );
  if (rad) q.radiusKm = toKm(parseFloat(rad[1].replace(',', '.')), rad[2]);

  // 2) Khoảng cách tối đa: "cách/xa (không quá|tối đa|dưới|trong vòng) N km/m"
  const maxd = t.match(
    /(?:cach|xa|trong vong|trong|toi da|khong qua|duoi)\s*(?:khong qua\s*|toi da\s*|duoi\s*)?(\d+(?:[.,]\d+)?)\s*(km|m|met)/,
  );
  if (maxd) {
    q.maxDistanceKm = toKm(parseFloat(maxd[1].replace(',', '.')), maxd[2]);
  }

  // 3) Phương tiện + thời gian: "đi xe máy (khoảng) N phút" -> suy ra maxDistanceKm
  const mode = detectTransport(t);
  if (mode) q.transportMode = mode;
  const mins = t.match(/(\d+)\s*phut/);
  if (mins) {
    const minutes = Number(mins[1]);
    const speed = SPEED_KMH[mode ?? 'unknown'];
    const derived = Number(((speed * minutes) / 60).toFixed(2));
    // Chỉ dùng làm maxDistance nếu chưa có con số km rõ ràng hơn.
    if (q.maxDistanceKm === undefined && q.radiusKm === undefined) {
      q.maxDistanceKm = derived;
      q.derivedFromMinutes = minutes;
      if (!q.transportMode) q.transportMode = 'unknown';
    }
  }

  // 4) Loại ràng buộc
  if (hasNumericConstraint(q)) {
    q.distanceRequirement = 'within';
  } else if (/quanh|xung quanh|lan can|khu vuc quanh/.test(t)) {
    q.distanceRequirement = 'around';
  } else if (/\bgan\b|gan khu|gan truong|gan duong|gan ben|gan cho|o gan/.test(t)) {
    q.distanceRequirement = 'near';
  }

  // 5) Địa điểm tâm (best-effort). Lấy cụm sau từ khoá vị trí, cắt ở ranh giới
  //    thường gặp (giá/triệu/phòng/dấu câu). Đây chỉ là gợi ý — matcher vẫn ưu
  //    tiên khu vực đã trích xuất/landmark nếu cái này rỗng.
  const target = extractTargetLocation(text);
  if (target) q.targetLocation = target;

  return q;
}

// Bóc tên địa điểm ngay sau từ khoá "gần/quanh/cạnh/khu vực" trên câu GỐC (giữ
// dấu để không làm hỏng tên riêng). Dừng ở dấu câu hoặc từ khoá không liên quan.
function extractTargetLocation(original: string): string | undefined {
  const m = original.match(
    /(?:gần|quanh|xung quanh|cạnh|kế|khu vực|gần khu)\s+([^,.;\n]+)/i,
  );
  if (!m) return undefined;
  let phrase = m[1].trim();
  // Cắt phần đuôi là ràng buộc khác (giá/bán kính/số người/thời gian) HOẶC từ
  // hỏi ("không", "chưa"...) — nếu không cắt, "ĐH Công nghiệp không" sẽ geocode hụt.
  phrase = phrase
    .split(
      /\s+(?:giá|tầm|khoảng|bán kính|cách|không quá|trong vòng|trong|không|ko|chưa|chua|thì|\d+\s*(?:triệu|tr|km|m|phút|người))/i,
    )[0]
    .trim();
  // Loại từ đệm cuối câu ("ạ", "nhé", "vậy", "với"...).
  phrase = phrase
    .replace(/[\s,]+$/, '')
    .replace(/\s+(?:ạ|à|nhé|nhe|nha|nhá|với|voi|thế|vậy|vay|nhỉ|nhi|đó|do)$/i, '')
    .trim();
  return phrase.length >= 2 ? phrase : undefined;
}
