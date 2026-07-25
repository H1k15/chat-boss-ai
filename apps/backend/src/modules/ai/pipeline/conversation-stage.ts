import { ConversationTurn, CustomerIntent, NextAction } from '@cba/shared';
import { deaccent } from '../../../common/vietnamese';
import { CoreSlot, SlotProfile } from './slots';

// STATE MACHINE hội thoại + bộ chọn NEXT_ACTION — TẤT ĐỊNH (CODE quyết, không
// để model quyết bước). Xem yêu cầu mục III, IV, V, XV.

export type Stage =
  | 'NEW'
  | 'QUALIFYING'
  | 'MATCH_READY'
  | 'ROOMS_PROPOSED'
  | 'INTEREST_CONFIRMED'
  | 'CONTACT_COLLECTION'
  | 'SCHEDULING'
  | 'APPOINTMENT_SET'
  | 'HUMAN_HANDOFF'
  | 'CLOSED';

export type OrchAction =
  | 'ASK_LOCATION_AND_BUDGET'
  | 'ASK_LOCATION'
  | 'ASK_BUDGET'
  | 'ASK_MOVE_IN_DATE'
  | 'ASK_OCCUPANTS'
  | 'PROPOSE_ROOMS'
  | 'ASK_ONE_TRADEOFF'
  | 'ANSWER_ROOM_QUESTION'
  | 'ASK_INTEREST'
  | 'ASK_VIEWING_DAY'
  | 'ASK_VIEWING_TIME'
  | 'ASK_CONTACT'
  | 'CREATE_APPOINTMENT'
  | 'HANDOFF';

export interface StageInput {
  profile: SlotProfile;
  matchedCount: number;
  intent: CustomerIntent;
  lastCustomerText: string;
  roomsProposedBefore: boolean;
}

export interface Decision {
  stage: Stage;
  action: OrchAction;
  nextAction: NextAction; // map sang enum cũ cho response/extension
  knownSlots: CoreSlot[];
  missingSlots: CoreSlot[];
  requiredQuestion: string; // chỉ dẫn cho model
  forbiddenTopics: string[];
  answerHint?: string; // câu trả lời ngắn TẤT ĐỊNH cho chen ngang (FAQ)
  fallbackMessage: string; // template dùng khi model hỏng
  maxWords: number;
  proposeRooms: boolean;
  createAppointment: boolean;
  handoffReason?: string;
}

// ---- Template fallback tất định (mục XV) ----------------------------------
export const TEMPLATES = {
  ASK_LOCATION_AND_BUDGET:
    'Bạn muốn tìm phòng quanh khu vực nào và ngân sách khoảng bao nhiêu mỗi tháng ạ? Mình lọc đúng các phòng phù hợp để bạn dễ chọn nhé.',
  ASK_LOCATION:
    'Bạn muốn tìm phòng quanh khu vực, tuyến đường hoặc địa điểm nào ạ?',
  ASK_BUDGET:
    'Ngân sách tối đa bạn dự kiến cho tiền phòng mỗi tháng khoảng bao nhiêu ạ?',
  ASK_MOVE_IN_DATE:
    'Bạn dự kiến chuyển vào khoảng thời gian nào để mình kiểm tra đúng phòng còn trống nhé?',
  ASK_OCCUPANTS: 'Phòng mình dự kiến ở bao nhiêu người ạ?',
  ASK_INTEREST:
    'Bạn thấy các phòng trên thế nào ạ? Có phòng nào hợp để mình gửi thêm hình và sắp lịch xem cho bạn không?',
  ASK_VIEWING_DAY:
    'Phòng này khá sát nhu cầu của bạn. Bạn tiện qua xem hôm nay hay ngày mai ạ?',
  ASK_VIEWING_TIME: 'Bạn tiện khung giờ chiều hay tối ạ?',
  ASK_CONTACT:
    'Bạn cho mình xin số điện thoại hoặc Zalo nhé, mình gửi định vị và sắp lịch xem phòng cho bạn ạ.',
  ASK_ONE_TRADEOFF:
    'Hiện chưa có phòng khớp đủ cả khu vực và mức ngân sách bạn nói. Bạn ưu tiên giữ đúng khu vực hay có thể tăng ngân sách thêm một chút để mình lọc lại nhé?',
  HANDOFF:
    'Phần này để bạn nhân viên bên mình hỗ trợ bạn kỹ hơn nhé, mình chuyển thông tin ngay ạ.',
  PROPOSE_ROOMS: 'Mình gửi bạn vài phòng phù hợp nhất nhé.',
  ANSWER_ROOM_QUESTION: 'Dạ mình gửi thông tin bạn hỏi ngay ạ.',
} as const;

// FAQ chen ngang trả lời ngắn TẤT ĐỊNH (mục V) — rồi vẫn quay lại slot còn thiếu.
const FAQ: { re: RegExp; answer: string }[] = [
  {
    re: /moi gioi|mat phi|co phi|ton phi|tinh phi|phi dich vu moi gioi/,
    answer: 'Bên mình hỗ trợ xem phòng miễn phí, không mất phí môi giới ạ.',
  },
  {
    re: /coc bao nhieu|dat coc|tien coc/,
    answer: 'Mức cọc tuỳ phòng, mình sẽ báo chính xác theo từng phòng ạ.',
  },
];

// Handoff (mục XIX): thương lượng giá / giữ phòng / pháp lý / gặp người thật /
// tố cáo lừa đảo.
export function detectHandoff(text: string): string | undefined {
  const s = deaccent(text);
  if (/giam gia|bot gia|mac ca|thuong luong gia|gia chot|sale gia/.test(s))
    return 'Khách muốn thương lượng giá';
  if (/giu phong cho|giu phong giup|dat coc truoc|coc giu phong/.test(s))
    return 'Khách muốn giữ phòng/đặt cọc';
  if (/hop dong|dieu khoan|phap ly|phap luat|kien|to cao/.test(s))
    return 'Khách hỏi pháp lý/hợp đồng';
  if (/gap nhan vien|nguoi that|nhan vien that|noi chuyen voi nguoi|goi dien cho toi/.test(s))
    return 'Khách yêu cầu gặp nhân viên';
  if (/lua dao|lua tien|phot|bao cong an|scam/.test(s))
    return 'Dấu hiệu khiếu nại/lừa đảo';
  return undefined;
}

function matchFaq(text: string): string | undefined {
  const s = deaccent(text);
  return FAQ.find((f) => f.re.test(s))?.answer;
}

// Khách thể hiện QUAN TÂM phòng.
function isInterested(text: string, intent: CustomerIntent): boolean {
  if (intent === CustomerIntent.WANT_VIEWING) return true;
  const s = deaccent(text);
  return /\bok\b|oke|okie|\bdc\b|duoc|thich|lay phong|chot phong|phong nao cung|quan tam|muon xem|xem phong/.test(
    s,
  );
}

// Câu khách hỏi VỀ PHÒNG (giá/tiện ích/ảnh/địa chỉ) khi đã đề xuất.
function isRoomQuestion(intent: CustomerIntent): boolean {
  return (
    intent === CustomerIntent.ASK_PRICE ||
    intent === CustomerIntent.ASK_UTILITIES ||
    intent === CustomerIntent.ASK_MEDIA ||
    intent === CustomerIntent.ASK_ADDRESS
  );
}

// Dò tín hiệu ngày/giờ xem trong lời khách.
function hasViewingDay(text: string): boolean {
  return /hom nay|ngay mai|mai|cuoi tuan|thu [2-7]|chu nhat|\d{1,2}\/\d{1,2}/.test(
    deaccent(text),
  );
}
function hasViewingTime(text: string): boolean {
  return /sang|trua|chieu|toi|\d{1,2}\s*(h|gio)/.test(deaccent(text));
}

const CORE_FORBIDDEN = [
  'Không tự đề xuất phòng ngoài danh sách hệ thống cung cấp',
  'Không tự thêm giá/địa chỉ/tiện ích/link',
  'Không tạo cảm giác khan hiếm giả hay cam kết giữ phòng/giảm giá',
  'Không tự quyết định câu hỏi tiếp theo',
];

function knownMissing(profile: SlotProfile): {
  known: CoreSlot[];
  missing: CoreSlot[];
} {
  const known: CoreSlot[] = [];
  const missing: CoreSlot[] = [];
  (profile.hasLocation ? known : missing).push('target_location');
  (profile.hasBudget ? known : missing).push('budget');
  (profile.hasMoveIn ? known : missing).push('move_in_date');
  if (profile.hasOccupants) known.push('occupants');
  return { known, missing };
}

/** Nhãn cấm hỏi lại slot đã biết -> đưa vào forbiddenTopics cho model + SafetyGuard. */
export function noReaskTopics(known: CoreSlot[]): string[] {
  const label: Record<CoreSlot, string> = {
    target_location: 'Không hỏi lại khu vực',
    budget: 'Không hỏi lại ngân sách',
    move_in_date: 'Không hỏi lại thời gian chuyển vào',
    occupants: 'Không hỏi lại số người ở',
  };
  return known.map((k) => label[k]);
}

// ===== Bộ chọn NEXT_ACTION tất định =====
export function decide(input: StageInput): Decision {
  const { profile, matchedCount, intent, lastCustomerText, roomsProposedBefore } =
    input;
  const { known, missing } = knownMissing(profile);
  const answerHint = matchFaq(lastCustomerText);
  const baseForbidden = [...CORE_FORBIDDEN, ...noReaskTopics(known)];

  const mk = (
    partial: Omit<
      Decision,
      | 'knownSlots'
      | 'missingSlots'
      | 'forbiddenTopics'
      | 'answerHint'
      | 'maxWords'
      | 'proposeRooms'
      | 'createAppointment'
    > &
      Partial<
        Pick<
          Decision,
          'answerHint' | 'proposeRooms' | 'createAppointment' | 'maxWords'
        >
      >,
  ): Decision => ({
    knownSlots: known,
    missingSlots: missing,
    forbiddenTopics: baseForbidden,
    answerHint,
    maxWords: 60,
    proposeRooms: false,
    createAppointment: false,
    ...partial,
  });

  // 1) HANDOFF — ưu tiên cao nhất.
  const handoffReason = detectHandoff(lastCustomerText);
  if (handoffReason) {
    return mk({
      stage: 'HUMAN_HANDOFF',
      action: 'HANDOFF',
      nextAction: NextAction.HANDOFF,
      requiredQuestion:
        'Báo khách sẽ có nhân viên hỗ trợ, KHÔNG tự tư vấn tiếp phần này.',
      fallbackMessage: TEMPLATES.HANDOFF,
      handoffReason,
    });
  }

  // 2) LUỒNG HẸN XEM — khi khách muốn xem phòng.
  const wantViewing =
    intent === CustomerIntent.WANT_VIEWING ||
    (roomsProposedBefore && isInterested(lastCustomerText, intent));
  if (wantViewing) {
    const day = hasViewingDay(lastCustomerText);
    const time = hasViewingTime(lastCustomerText);
    if (!day) {
      return mk({
        stage: 'SCHEDULING',
        action: 'ASK_VIEWING_DAY',
        nextAction: NextAction.BOOK_VIEWING,
        requiredQuestion: 'Hỏi khách tiện qua xem hôm nay hay ngày mai.',
        fallbackMessage: TEMPLATES.ASK_VIEWING_DAY,
      });
    }
    if (!time) {
      return mk({
        stage: 'SCHEDULING',
        action: 'ASK_VIEWING_TIME',
        nextAction: NextAction.BOOK_VIEWING,
        requiredQuestion: 'Hỏi khách tiện khung giờ chiều hay tối.',
        fallbackMessage: TEMPLATES.ASK_VIEWING_TIME,
      });
    }
    if (!profile.phone) {
      return mk({
        stage: 'CONTACT_COLLECTION',
        action: 'ASK_CONTACT',
        nextAction: NextAction.ASK_PHONE,
        requiredQuestion:
          'Xin số điện thoại/Zalo để gửi định vị và tạo lịch xem.',
        fallbackMessage: TEMPLATES.ASK_CONTACT,
      });
    }
    return mk({
      stage: 'APPOINTMENT_SET',
      action: 'CREATE_APPOINTMENT',
      nextAction: NextAction.BOOK_VIEWING,
      requiredQuestion:
        'Xác nhận lại lịch xem (ngày/giờ) và địa điểm theo dữ liệu đã có.',
      fallbackMessage:
        'Mình xác nhận lịch xem phòng cho bạn nhé, hẹn gặp bạn ạ.',
      createAppointment: true,
    });
  }

  // 3) THU THẬP CỐT LÕI (chỉ hỏi slot CÒN THIẾU).
  if (!profile.hasLocation && !profile.hasBudget) {
    return mk({
      stage: profile.askedSlots.length ? 'QUALIFYING' : 'NEW',
      action: 'ASK_LOCATION_AND_BUDGET',
      nextAction: NextAction.ASK_INFO,
      requiredQuestion: 'Hỏi khu vực muốn thuê VÀ ngân sách tối đa (2 ý ngắn).',
      fallbackMessage: TEMPLATES.ASK_LOCATION_AND_BUDGET,
    });
  }
  if (!profile.hasLocation) {
    return mk({
      stage: 'QUALIFYING',
      action: 'ASK_LOCATION',
      nextAction: NextAction.ASK_INFO,
      requiredQuestion: 'Hỏi khu vực / tuyến đường / địa điểm muốn ở gần.',
      fallbackMessage: TEMPLATES.ASK_LOCATION,
    });
  }
  if (!profile.hasBudget) {
    return mk({
      stage: 'QUALIFYING',
      action: 'ASK_BUDGET',
      nextAction: NextAction.ASK_INFO,
      requiredQuestion: 'Hỏi ngân sách tối đa cho tiền phòng mỗi tháng.',
      fallbackMessage: TEMPLATES.ASK_BUDGET,
    });
  }
  // Có location + budget: lấy move_in nếu chưa có VÀ chưa từng hỏi.
  if (!profile.hasMoveIn && !profile.askedSlots.includes('move_in_date')) {
    return mk({
      stage: 'QUALIFYING',
      action: 'ASK_MOVE_IN_DATE',
      nextAction: NextAction.ASK_INFO,
      requiredQuestion: 'Hỏi thời gian dự kiến chuyển vào.',
      fallbackMessage: TEMPLATES.ASK_MOVE_IN_DATE,
    });
  }

  // 4) ĐỦ DỮ LIỆU -> lọc/đề xuất.
  if (matchedCount <= 0) {
    return mk({
      stage: 'MATCH_READY',
      action: 'ASK_ONE_TRADEOFF',
      nextAction: NextAction.ASK_INFO,
      requiredQuestion:
        'Báo chưa có phòng khớp đủ, hỏi ĐÚNG 1 câu: ưu tiên giữ khu vực hay nới ngân sách.',
      fallbackMessage: TEMPLATES.ASK_ONE_TRADEOFF,
    });
  }

  // Đã đề xuất trước đó -> xử lý sau đề xuất.
  if (roomsProposedBefore) {
    if (isRoomQuestion(intent)) {
      return mk({
        stage: 'ROOMS_PROPOSED',
        action: 'ANSWER_ROOM_QUESTION',
        nextAction: NextAction.ASK_INFO,
        requiredQuestion:
          'Trả lời NGẮN câu khách hỏi về phòng theo dữ liệu đã cung cấp, rồi hỏi khách có muốn xem phòng không.',
        fallbackMessage: TEMPLATES.ASK_INTEREST,
      });
    }
    return mk({
      stage: 'ROOMS_PROPOSED',
      action: 'ASK_INTEREST',
      nextAction: NextAction.ASK_INFO,
      requiredQuestion:
        'Hỏi khách thấy phòng thế nào, có muốn xem phòng nào không.',
      fallbackMessage: TEMPLATES.ASK_INTEREST,
    });
  }

  // Lần đầu đủ dữ liệu -> ĐỀ XUẤT phòng (code chọn, model chỉ diễn đạt).
  return mk({
    stage: 'MATCH_READY',
    action: 'PROPOSE_ROOMS',
    nextAction: NextAction.SEND_MEDIA,
    requiredQuestion:
      'Giới thiệu ngắn 2-3 phòng trong DU_LIEU_PHONG (mã, khu, giá, vài tiện ích, lý do hợp), rồi hỏi khách muốn xem phòng nào.',
    fallbackMessage: TEMPLATES.PROPOSE_ROOMS,
    proposeRooms: true,
    maxWords: 110,
  });
}
