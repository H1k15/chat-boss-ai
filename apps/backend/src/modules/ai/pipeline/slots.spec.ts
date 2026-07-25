import { ConversationTurn, ExtractedInfo } from '@cba/shared';
import { buildSlotProfile, detectAskedSlots } from './slots';

describe('detectAskedSlots — dò slot bot đã hỏi', () => {
  it('bot hỏi khu vực + ngân sách -> phát hiện cả hai', () => {
    const conv: ConversationTurn[] = [
      { role: 'customer', text: 'còn phòng không' },
      {
        role: 'staff',
        text: 'Bạn muốn tìm quanh khu vực nào và ngân sách khoảng bao nhiêu mỗi tháng ạ?',
      },
    ];
    expect(detectAskedSlots(conv)).toEqual(
      expect.arrayContaining(['target_location', 'budget']),
    );
  });

  it('bot hỏi thời gian chuyển vào -> move_in_date', () => {
    const conv: ConversationTurn[] = [
      { role: 'staff', text: 'Bạn dự kiến chuyển vào khoảng thời gian nào ạ?' },
    ];
    expect(detectAskedSlots(conv)).toContain('move_in_date');
  });
});

describe('buildSlotProfile — suy hồ sơ nhu cầu', () => {
  const now = new Date(2026, 6, 15);

  it('đủ khu vực + ngân sách + "cần gấp" -> hasLocation/Budget/MoveIn = true', () => {
    const info: ExtractedInfo = { area: 'Cầu Diễn', budgetMax: 3_000_000 };
    const conv: ConversationTurn[] = [
      { role: 'customer', text: 'cần phòng Cầu Diễn 3 triệu, cần gấp' },
    ];
    const p = buildSlotProfile(info, conv, now);
    expect(p.hasLocation).toBe(true);
    expect(p.hasBudget).toBe(true);
    expect(p.hasMoveIn).toBe(true);
    expect(p.moveInIntent).toBe('immediate');
    expect(p.targetLocation).toBe('Cầu Diễn');
  });

  it('chưa có gì -> tất cả false', () => {
    const p = buildSlotProfile({}, [{ role: 'customer', text: 'alo' }], now);
    expect(p.hasLocation).toBe(false);
    expect(p.hasBudget).toBe(false);
    expect(p.hasMoveIn).toBe(false);
  });

  it('targetLocation ưu tiên trường targetLocation hơn area', () => {
    const info: ExtractedInfo = { area: 'Nhổn', targetLocation: 'ĐH Công nghiệp' };
    const p = buildSlotProfile(info, [], now);
    expect(p.targetLocation).toBe('ĐH Công nghiệp');
  });
});
