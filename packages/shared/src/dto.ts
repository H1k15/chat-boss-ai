// Kiểu dữ liệu chia sẻ cho API AI và CRM.
import {
  Channel,
  CustomerIntent,
  NextAction,
  CustomerStatus,
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
}
