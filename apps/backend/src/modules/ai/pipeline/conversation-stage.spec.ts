import { CustomerIntent } from '@cba/shared';
import { decide } from './conversation-stage';
import { SlotProfile } from './slots';

const P = (over: Partial<SlotProfile> = {}): SlotProfile => ({
  requiredAmenities: [],
  askedSlots: [],
  hasLocation: false,
  hasBudget: false,
  hasMoveIn: false,
  hasOccupants: false,
  ...over,
});

const run = (o: {
  profile?: SlotProfile;
  matchedCount?: number;
  intent?: CustomerIntent;
  lastCustomerText?: string;
  roomsProposedBefore?: boolean;
}) =>
  decide({
    profile: o.profile ?? P(),
    matchedCount: o.matchedCount ?? 0,
    intent: o.intent ?? CustomerIntent.OTHER,
    lastCustomerText: o.lastCustomerText ?? '',
    roomsProposedBefore: o.roomsProposedBefore ?? false,
  });

describe('decide — state machine + next_action (tất định)', () => {
  it('KB1: "còn phòng không?" chưa có gì -> hỏi khu vực + ngân sách, KHÔNG đề xuất', () => {
    const d = run({
      intent: CustomerIntent.ASK_AVAILABILITY,
      lastCustomerText: 'còn phòng không shop',
    });
    expect(d.action).toBe('ASK_LOCATION_AND_BUDGET');
    expect(d.proposeRooms).toBe(false);
  });

  it('KB2: có khu vực + ngân sách, thiếu ngày vào -> hỏi ngày vào', () => {
    const d = run({ profile: P({ hasLocation: true, hasBudget: true }) });
    expect(d.action).toBe('ASK_MOVE_IN_DATE');
    expect(d.missingSlots).toContain('move_in_date');
    // KHÔNG hỏi lại khu vực/ngân sách đã biết.
    expect(d.forbiddenTopics).toEqual(
      expect.arrayContaining(['Không hỏi lại khu vực', 'Không hỏi lại ngân sách']),
    );
  });

  it('KB3: đủ 3 cốt lõi + có phòng, chưa đề xuất -> PROPOSE_ROOMS', () => {
    const d = run({
      profile: P({ hasLocation: true, hasBudget: true, hasMoveIn: true }),
      matchedCount: 2,
    });
    expect(d.action).toBe('PROPOSE_ROOMS');
    expect(d.proposeRooms).toBe(true);
  });

  it('KB4: chen ngang hỏi phí -> answerHint có "miễn phí", vẫn hỏi slot thiếu', () => {
    const d = run({
      profile: P({ hasLocation: true }),
      lastCustomerText: 'bên mình có mất phí môi giới không',
    });
    expect(d.answerHint).toContain('miễn phí');
    expect(d.action).toBe('ASK_BUDGET');
  });

  it('KB6: đủ dữ liệu nhưng KHÔNG có phòng -> ASK_ONE_TRADEOFF, không bịa phòng', () => {
    const d = run({
      profile: P({ hasLocation: true, hasBudget: true, hasMoveIn: true }),
      matchedCount: 0,
    });
    expect(d.action).toBe('ASK_ONE_TRADEOFF');
    expect(d.proposeRooms).toBe(false);
  });

  it('KB7: số người đã biết -> không hỏi lại, không nằm trong missing', () => {
    const d = run({
      profile: P({ hasLocation: true, hasBudget: true, hasOccupants: true }),
    });
    expect(d.missingSlots).not.toContain('occupants');
    expect(d.knownSlots).toContain('occupants');
    expect(d.forbiddenTopics).toContain('Không hỏi lại số người ở');
  });

  it('KB9: đã đề xuất + khách hỏi giá phòng -> ANSWER_ROOM_QUESTION', () => {
    const d = run({
      profile: P({ hasLocation: true, hasBudget: true, hasMoveIn: true }),
      matchedCount: 2,
      roomsProposedBefore: true,
      intent: CustomerIntent.ASK_PRICE,
    });
    expect(d.action).toBe('ANSWER_ROOM_QUESTION');
  });

  it('KB10: khách muốn xem phòng, chưa có ngày -> ASK_VIEWING_DAY', () => {
    const d = run({
      intent: CustomerIntent.WANT_VIEWING,
      lastCustomerText: 'cho mình xem phòng với',
    });
    expect(d.action).toBe('ASK_VIEWING_DAY');
  });

  it('Hẹn xem đủ ngày+giờ+SĐT -> CREATE_APPOINTMENT', () => {
    const d = run({
      profile: P({ hasLocation: true, hasBudget: true, phone: '0912345678' }),
      intent: CustomerIntent.WANT_VIEWING,
      lastCustomerText: 'mai chiều mình qua xem nhé',
    });
    expect(d.action).toBe('CREATE_APPOINTMENT');
    expect(d.createAppointment).toBe(true);
  });

  it('Handoff: khách đòi giảm giá -> HANDOFF', () => {
    const d = run({ lastCustomerText: 'giảm giá được không em' });
    expect(d.action).toBe('HANDOFF');
    expect(d.stage).toBe('HUMAN_HANDOFF');
    expect(d.handoffReason).toBeTruthy();
  });

  it('Sau xem - không thích -> ASK_POST_VIEWING (hỏi 1 lý do)', () => {
    const d = run({ lastCustomerText: 'xem phòng rồi nhưng không thích lắm' });
    expect(d.action).toBe('ASK_POST_VIEWING');
    expect(d.stage).toBe('POST_VIEWING_FOLLOW_UP');
    expect(d.fallbackMessage).toMatch(/giá|vị trí|diện tích|nội thất/);
  });

  it('Sau xem - chưa đi được -> ASK_POST_VIEWING (đổi lịch, không trách)', () => {
    const d = run({ lastCustomerText: 'bận quá mình chưa qua xem được' });
    expect(d.action).toBe('ASK_POST_VIEWING');
    expect(d.fallbackMessage).toMatch(/đổi lịch/);
  });

  it('Ngân sách mơ hồ (đã hỏi 1 lần) -> hỏi lại CÓ LỰA CHỌN', () => {
    const d = run({
      profile: P({ hasLocation: true, askedSlots: ['budget'] }),
      lastCustomerText: 'cũng bình thường thôi',
    });
    expect(d.action).toBe('ASK_BUDGET');
    expect(d.fallbackMessage).toMatch(/dưới 3 triệu.*3–4 triệu.*trên 4 triệu/);
  });

  it('Sau xem - "phòng chật quá" -> not_liked', () => {
    const d = run({ lastCustomerText: 'xem rồi phòng chật quá' });
    expect(d.action).toBe('ASK_POST_VIEWING');
    expect(d.fallbackMessage).toMatch(/giá|vị trí|diện tích|nội thất/);
  });

  it('Lệch chủ đề (IRRELEVANT) -> answerHint gạt khéo', () => {
    const d = run({
      intent: CustomerIntent.IRRELEVANT,
      lastCustomerText: 'quán ăn gần đó có ngon không',
    });
    expect(d.answerHint).toMatch(/hỗ trợ thông tin/);
    expect(d.action).toBe('ASK_LOCATION_AND_BUDGET');
  });

  it('Handoff: "bớt cho anh 200k" -> HANDOFF (mặc cả không có chữ "giá")', () => {
    const d = run({ lastCustomerText: 'phòng đức diễn bớt cho anh 200k được không' });
    expect(d.action).toBe('HANDOFF');
  });

  it('Chống hỏi lại: đã có khu vực -> không ra ASK_LOCATION', () => {
    const d = run({ profile: P({ hasLocation: true }) });
    expect(d.action).not.toBe('ASK_LOCATION');
    expect(d.action).toBe('ASK_BUDGET');
  });
});
