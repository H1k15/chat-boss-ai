import { MatchedRoom } from '@cba/shared';
import { SafetyGuardService } from './safety-guard.service';

const room = (over: Partial<MatchedRoom>): MatchedRoom =>
  ({
    id: 'r1',
    roomCode: 'P101',
    area: 'Cầu Diễn',
    price: 3_000_000,
    highlights: [],
    matchScore: 1,
    ...over,
  }) as MatchedRoom;

describe('SafetyGuard.checkOrchestrated — kiểm tin nhắn orchestrator', () => {
  const svc = new SafetyGuardService();

  it('hỏi lại slot ĐÃ BIẾT (khu vực) -> chặn', () => {
    const r = svc.checkOrchestrated(
      'Dạ bạn muốn tìm quanh khu vực nào ạ?',
      [],
      ['target_location'],
    );
    expect(r.blocked).toBe(true);
    expect(r.reasons.join(' ')).toContain('target_location');
  });

  it('tạo khan hiếm giả -> chặn', () => {
    const r = svc.checkOrchestrated(
      'Phòng sắp hết, nhanh tay kẻo lỡ ạ!',
      [],
      [],
    );
    expect(r.blocked).toBe(true);
  });

  it('cam kết giữ phòng/giảm giá -> chặn', () => {
    const r = svc.checkOrchestrated('Em giữ phòng cho bạn nhé', [], []);
    expect(r.blocked).toBe(true);
  });

  it('nêu giá KHÔNG có trong phòng -> chặn (giữ nguyên logic cũ)', () => {
    const r = svc.checkOrchestrated('Phòng này giá 5 triệu ạ', [room({})], []);
    expect(r.blocked).toBe(true);
  });

  it('tin nhắn sạch, không hỏi lại -> không chặn', () => {
    const r = svc.checkOrchestrated(
      'Dạ phòng P101 khu Cầu Diễn giá 3 triệu ạ, bạn tiện xem hôm nay hay ngày mai?',
      [room({})],
      ['target_location', 'budget'],
    );
    expect(r.blocked).toBe(false);
  });
});
