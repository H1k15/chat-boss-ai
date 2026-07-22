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
}

export interface MatchedRoom {
  id: string;
  roomCode: string;
  area: string;
  address?: string;
  price: number; // VND
  roomType?: string;
  highlights: string[]; // ["có gác", "WC riêng", "giờ tự do"]
  imageLinks?: string[];
  videoLinks?: string[];
  matchScore: number; // 0..1
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
