import { ExcelService } from './excel.service';
import { RoomStatus } from '@prisma/client';

// Chỉ test lớp chuẩn hoá dữ liệu (không đụng DB) — đây là chỗ dễ sai nhất
// khi mỗi chủ trọ gõ Excel một kiểu.
describe('ExcelService — chuẩn hoá dữ liệu', () => {
  const svc = new ExcelService(null as never);
  // Truy cập các hàm private để test đơn vị từng bộ parse.
  const call = <T>(name: string, ...args: unknown[]): T =>
    (svc as unknown as Record<string, (...a: unknown[]) => T>)[name](...args);

  describe('parseMoney', () => {
    it.each([
      ['3.500.000', 3500000],
      ['3500000', 3500000],
      ['3tr5', 3500000],
      ['3tr', 3000000],
      ['3,5tr', 3500000],
      ['3tr50', 3500000],
      ['3tr500', 3500000],
      ['3tr8', 3800000],
      ['3 triệu 5', 3500000],
      ['4.000', 4000],
      ['', 0],
    ])('đọc "%s" thành %i', (input, expected) => {
      expect(svc.parseMoney(input)).toBe(expected);
    });
  });

  describe('parsePeopleRange', () => {
    it('đọc khoảng "1-2 người"', () => {
      expect(call('parsePeopleRange', '1-2 người')).toEqual({ min: 1, max: 2 });
    });
    it('đọc số đơn "2 người"', () => {
      expect(call('parsePeopleRange', '2 người')).toEqual({ min: 2, max: 2 });
    });
    it('đọc gạch ngang dài "1 – 3"', () => {
      expect(call('parsePeopleRange', '1 – 3')).toEqual({ min: 1, max: 3 });
    });
    it('trả null khi để trống', () => {
      expect(call('parsePeopleRange', '')).toEqual({ min: null, max: null });
    });
  });

  describe('parseDeposit', () => {
    it('quy đổi "1 tháng" thành một tháng tiền thuê', () => {
      expect(call('parseDeposit', '1 tháng', 3500000)).toBe(3500000);
    });
    it('quy đổi "2 tháng"', () => {
      expect(call('parseDeposit', '2 tháng', 3500000)).toBe(7000000);
    });
    it('đọc số tiền ghi thẳng', () => {
      expect(call('parseDeposit', '3.500.000', 3500000)).toBe(3500000);
    });
  });

  describe('parseStatus', () => {
    it.each([
      ['Còn', RoomStatus.AVAILABLE],
      ['Đã cọc', RoomStatus.DEPOSITED],
      ['Đã thuê', RoomStatus.RENTED],
      ['', RoomStatus.AVAILABLE],
    ])('đọc "%s"', (input, expected) => {
      expect(call('parseStatus', input)).toBe(expected);
    });
  });

  describe('mapColumns — chống nhầm cột', () => {
    it('KHÔNG nhầm "Diện tích" thành giá điện', () => {
      const map = call<Map<string, string>>('mapColumns', {
        'Mã phòng': 'P001',
        'Khu vực': 'Gò Vấp',
        'Giá thuê': '3.500.000',
        'Diện tích': '20m2',
        Điện: '4.000',
        'Trạng thái': 'Còn',
      });
      expect(map.get('size')).toBe('Diện tích');
      expect(map.get('electricityPrice')).toBe('Điện');
      expect(map.get('price')).toBe('Giá thuê');
    });

    it('KHÔNG nhầm "Giá điện" thành giá thuê khi header không dấu', () => {
      const map = call<Map<string, string>>('mapColumns', {
        'Ma phong': 'P001',
        'Gia dien': '4000',
        'Gia thue': '3500000',
        'Dien tich': '20',
      });
      expect(map.get('price')).toBe('Gia thue');
      expect(map.get('size')).toBe('Dien tich');
    });

    it('một cột chỉ được gán cho một field', () => {
      const map = call<Map<string, string>>('mapColumns', {
        'Giá thuê': '3500000',
        'Trạng thái': 'Còn',
      });
      const used = [...map.values()];
      expect(new Set(used).size).toBe(used.length);
    });
  });

  describe('parseLinks', () => {
    it('chỉ nhận URL hợp lệ', () => {
      expect(
        call('parseLinks', 'https://a.com/1.jpg, không có, http://b.com/2.jpg'),
      ).toEqual(['https://a.com/1.jpg', 'http://b.com/2.jpg']);
    });
  });

  describe('parseUtilities', () => {
    it('nhận diện tiện ích không dấu lẫn có dấu', () => {
      expect(call('parseUtilities', 'Máy lạnh, tủ lạnh, nệm')).toEqual([
        'may_lanh',
        'tu_lanh',
        'nem',
      ]);
      expect(call('parseUtilities', 'may lanh, gac')).toEqual([
        'may_lanh',
        'gac',
      ]);
    });
  });
});
