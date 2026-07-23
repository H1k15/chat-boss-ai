import { SafetyGuardService } from './safety-guard.service';
import { MatchedRoom } from '@cba/shared';

describe('SafetyGuardService', () => {
  const guard = new SafetyGuardService();

  const room = (over: Partial<MatchedRoom> = {}): MatchedRoom => ({
    id: '1',
    roomCode: 'P001',
    area: 'Gò Vấp',
    address: 'Phan Văn Trị',
    price: 3800000,
    highlights: ['có gác'],
    matchScore: 0.9,
    ...over,
  });

  describe('chống lộ dữ liệu', () => {
    it('chặn gợi ý chứa số điện thoại', () => {
      const r = guard.check(['Anh gọi 0901234567 nhé'], [room()]);
      expect(r.reasons.some((x) => x.includes('điện thoại'))).toBe(true);
      expect(r.blocked).toBe(true);
    });

    it('chặn cả SĐT viết có dấu chấm', () => {
      const r = guard.check(['Số em là 090.123.4567 ạ'], [room()]);
      expect(r.blocked).toBe(true);
    });
  });

  describe('chống bịa giá', () => {
    it('chặn nêu giá khi không có phòng nào để tham chiếu', () => {
      const r = guard.check(['Dạ phòng này 3tr8 ạ'], []);
      expect(r.blocked).toBe(true);
    });

    it('cho qua giá khớp đúng phòng có thật', () => {
      const r = guard.check(['Dạ phòng P001 giá 3tr8/tháng ạ'], [room()]);
      expect(r.blocked).toBe(false);
      expect(r.safeSuggestions).toHaveLength(1);
    });

    it('chặn giá không khớp phòng nào', () => {
      // Kho chỉ có phòng 3.8tr, AI bịa ra 5tr.
      const r = guard.check(['Dạ phòng này 5 triệu ạ'], [room()]);
      expect(r.blocked).toBe(true);
      expect(r.reasons[0]).toContain('không khớp phòng nào');
    });

    it('chấp nhận cách nói làm tròn tự nhiên', () => {
      // "gần 4 triệu" cho phòng 3.800.000 là mô tả đúng, không phải bịa.
      const r = guard.check(['Dạ phòng gần 4 triệu ạ'], [room()]);
      expect(r.blocked).toBe(false);
    });

    it('không nhầm diện tích/số người thành giá', () => {
      const r = guard.check(
        ['Dạ phòng 20m2, ở 2 người thoải mái, giờ giấc tự do ạ'],
        [room()],
      );
      expect(r.blocked).toBe(false);
    });

    it('không nhầm "3 triệu 2 người" thành 3.200.000', () => {
      const r = guard.check(
        ['Dạ phòng 3 triệu 2 người ở được ạ'],
        [room({ price: 3000000 })],
      );
      expect(r.blocked).toBe(false);
    });

    it('đọc đúng nhiều định dạng giá', () => {
      expect(guard.extractAmounts('3tr8')).toEqual([3800000]);
      expect(guard.extractAmounts('3tr')).toEqual([3000000]);
      expect(guard.extractAmounts('3.5tr')).toEqual([3500000]);
      expect(guard.extractAmounts('3 triệu 5')).toEqual([3500000]);
      expect(guard.extractAmounts('3.500.000')).toEqual([3500000]);
      expect(guard.extractAmounts('3500000')).toEqual([3500000]);
      expect(guard.extractAmounts('500k')).toEqual([500000]);
    });

    it('bỏ qua số không phải tiền', () => {
      expect(guard.extractAmounts('phòng 20m2 cho 2 người, 17h xem')).toEqual(
        [],
      );
    });
  });

  describe('chống bịa mã phòng', () => {
    it('chặn mã phòng không có trong dữ liệu đã lọc', () => {
      const r = guard.check(['Dạ em còn phòng P999 nữa ạ'], [room()]);
      expect(r.blocked).toBe(true);
      expect(r.reasons[0]).toContain('P999');
    });

    it('cho qua mã phòng có thật', () => {
      const r = guard.check(['Dạ phòng P001 còn trống ạ'], [room()]);
      expect(r.blocked).toBe(false);
    });
  });

  describe('hành vi chung', () => {
    it('cho qua gợi ý an toàn khi có dữ liệu phòng', () => {
      const r = guard.check(
        ['Dạ còn phòng ạ, anh/chị cho em xin khu vực nhé'],
        [room()],
      );
      expect(r.blocked).toBe(false);
      expect(r.safeSuggestions.length).toBeGreaterThan(0);
    });

    it('chặn gợi ý quá dài', () => {
      const r = guard.check(['a'.repeat(700)], [room()]);
      expect(r.blocked).toBe(true);
    });

    it('luôn có câu fallback an toàn khi mọi gợi ý bị chặn', () => {
      const r = guard.check(['0901234567'], [room()]);
      expect(r.safeSuggestions.length).toBeGreaterThan(0);
      expect(r.safeSuggestions[0]).toContain('khu vực');
    });

    it('giữ lại gợi ý sạch và loại gợi ý bẩn', () => {
      const r = guard.check(
        ['Dạ phòng P001 giá 3tr8 ạ', 'Dạ phòng P999 giá 9tr ạ'],
        [room()],
      );
      expect(r.safeSuggestions).toHaveLength(1);
      expect(r.blocked).toBe(false);
      expect(r.reasons).toHaveLength(1);
    });
  });

  describe('cho phép giá dịch vụ trong dữ liệu phòng', () => {
    const withServices = room({
      note: 'Điện 4k/số, Nước 100k/người, Mạng 100k/phòng, Máy giặt 60k/ng',
      furniture: '1 Điều hòa, 1 Nóng Lạnh, 1 Giường, 2 Máy giặt chung, 1 wifi',
    });

    it('cho qua khi nhắc giá dịch vụ có thật trong dữ liệu phòng', () => {
      const r = guard.check(
        ['Dạ điện 4k/số, nước 100k/người, máy giặt 60k anh nhé'],
        [withServices],
      );
      expect(r.blocked).toBe(false);
      expect(r.safeSuggestions).toHaveLength(1);
    });

    it('vẫn chặn giá THUÊ bịa dù có cho phép giá dịch vụ', () => {
      // 5 triệu không phải giá thuê (3.8tr) cũng không phải giá dịch vụ nào.
      const r = guard.check(['Dạ phòng này 5 triệu ạ'], [withServices]);
      expect(r.blocked).toBe(true);
    });

    it('không nhầm số đếm nội thất thành tiền (1 điều hòa, 2 máy giặt)', () => {
      const r = guard.check(
        ['Dạ phòng có 1 điều hòa, 2 máy giặt chung và wifi ạ'],
        [withServices],
      );
      expect(r.blocked).toBe(false);
    });
  });
});
