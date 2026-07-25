// Kiểu dữ liệu chia sẻ cho API AI và CRM.
import {
  Channel,
  CustomerIntent,
  NextAction,
  CustomerStatus,
  NotifyEvent,
} from './enums';

export interface ConversationTurn {
  role: 'customer' | 'staff';
  text: string;
  ts?: string; // ISO time
}

export interface PostContext {
  text?: string;
  roomCodeGuess?: string;
}

export interface ExtractedInfo {
  name?: string;
  phone?: string;
  area?: string;
  budgetMin?: number; // VND
  budgetMax?: number; // VND
  peopleCount?: number;
  moveInDate?: string; // ISO date
  requirements?: string[]; // ["gác", "wc_rieng", "may_lanh"]
  // Yêu cầu KHOẢNG CÁCH (bóc bằng code, model không tự tính). Xem distance-parser.
  targetLocation?: string; // điểm mốc lấy làm tâm ("ĐH Công nghiệp")
  radiusKm?: number; // "bán kính N km"
  maxDistanceKm?: number; // "cách không quá N km" / suy từ thời gian đi lại
  distanceRequirement?: 'within' | 'near' | 'around' | 'none';
  transportMode?: 'walk' | 'motorbike' | 'car' | 'unknown';
}

/**
 * Vị trí phòng so với KHU KHÁCH HỎI: đúng khu / cùng cụm lân cận (vài km) /
 * khu khác. Chỉ có giá trị khi khách đã nói khu vực mong muốn.
 */
export type AreaRelation = 'exact' | 'nearby' | 'other';

export interface MatchedRoom {
  id: string;
  roomCode: string;
  area: string;
  areaRelation?: AreaRelation;
  address?: string;
  price: number; // VND
  roomType?: string;
  highlights: string[]; // ["có gác", "WC riêng", "giờ tự do"]
  furniture?: string; // nội thất nguyên văn — AI đọc để trả lời "có máy giặt không"
  note?: string; // giá dịch vụ + điều khoản nguyên văn (điện/nước/mạng...)
  imageLinks?: string[];
  videoLinks?: string[];
  matchScore: number; // 0..1
  // Khoảng cách (km) tới điểm mốc khách hỏi — CHỈ có khi geocode được cả phòng
  // lẫn điểm mốc (Haversine bằng code). Không có toạ độ -> undefined (KHÔNG bịa).
  distanceKm?: number;
}

/**
 * Kết quả phân giải điểm mốc khách hỏi (geocode qua Nominatim).
 * - OK: xác định được toạ độ, đã lọc theo bán kính.
 * - AMBIGUOUS: nhiều kết quả -> cần nhân viên xác nhận (không tự chọn).
 * - NOT_FOUND / GEOCODE_FAILED: fallback lọc theo khu vực, KHÔNG báo khoảng cách.
 * - NONE: khách không hỏi theo khoảng cách.
 */
export type LocationStatus =
  | 'OK'
  | 'AMBIGUOUS'
  | 'NOT_FOUND'
  | 'GEOCODE_FAILED'
  | 'NONE';

export interface LocationCandidate {
  displayName: string;
  lat: number;
  lng: number;
}

export interface LocationResolution {
  status: LocationStatus;
  target?: string; // điểm mốc đã dùng
  lat?: number;
  lng?: number;
  radiusKm?: number; // bán kính hiệu lực đã áp dụng
  candidates?: LocationCandidate[]; // khi AMBIGUOUS
  usedAreaFallback?: boolean; // đã phải lọc theo khu vì không geocode được
}

// Request cho POST /ai/suggest
export interface AiSuggestRequest {
  facebookProfileId: string;
  channel: Channel;
  conversation: ConversationTurn[];
  postContext?: PostContext;
  customerId?: string; // nếu đã biết khách để merge dữ liệu
}

// Response của POST /ai/suggest
export interface AiSuggestResponse {
  intent: CustomerIntent;
  extracted: ExtractedInfo;
  matchedRooms: MatchedRoom[];
  suggestions: string[]; // 1..3 gợi ý câu trả lời
  nextAction: NextAction;
  customerStageHint: CustomerStatus;
  safety: {
    blocked: boolean;
    reasons: string[];
  };
  // Mã của lần gợi ý này (ghi vào activity_logs). Extension giữ lại để khi
  // nhân viên gửi thật thì gọi POST /ai/feedback kèm mã này — nhờ đó ghép được
  // cặp "AI đề xuất -> người gửi", tín hiệu để fine-tune sau này.
  suggestionLogId?: string;
  // Phân giải điểm mốc (chỉ có khi khách hỏi theo khoảng cách). AMBIGUOUS =
  // nhân viên cần xác nhận địa điểm.
  location?: LocationResolution;
}

// Request cho POST /ai/feedback — nhân viên báo đã gửi câu nào.
export interface AiFeedbackRequest {
  suggestionLogId: string; // lấy từ AiSuggestResponse
  finalText: string; // câu thực sự gửi cho khách
  chosenIndex?: number; // đã chọn gợi ý thứ mấy (0-based); tự soạn thì bỏ trống
  edited?: boolean; // có sửa lại gợi ý trước khi gửi không
}

// Cấu hình Telegram sửa được runtime (GET/PATCH /telegram/config).
export interface TelegramConfig {
  defaultChatId: string; // chat nhận thông báo (ghi đè giá trị .env nếu đặt)
  events: Record<NotifyEvent, boolean>; // bật/tắt từng loại sự kiện
}

// GET /telegram/config trả kèm trạng thái chỉ-đọc (không sửa qua API).
export interface TelegramConfigView extends TelegramConfig {
  botConfigured: boolean; // TELEGRAM_BOT_TOKEN có được đặt trong .env không
  envChatId: string; // giá trị chat mặc định từ .env (để tham chiếu)
}
