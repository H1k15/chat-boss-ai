import { InfoExtractorService } from './info-extractor.service';

// SĐT là dữ liệu quyết định việc đẩy lead qua Telegram — sai một chữ số là
// gọi nhầm người. Vì vậy phần này dùng regex thuần, không giao cho LLM, và
// được test kỹ.
describe('InfoExtractorService — trích số điện thoại', () => {
  const svc = new InfoExtractorService(null as never);

  it.each([
    ['0901234567', '0901234567'],
    ['090 123 4567', '0901234567'],
    ['090.123.4567', '0901234567'],
    ['+84901234567', '0901234567'],
    ['84901234567', '0901234567'],
    ['0387654321', '0387654321'],
  ])('đọc "%s" thành %s', (input, expected) => {
    expect(svc.extractPhone(input)).toBe(expected);
  });

  it('lấy được số nằm giữa câu', () => {
    expect(svc.extractPhone('sdt em 0901234567 gọi giúp nha')).toBe(
      '0901234567',
    );
  });

  it('bỏ qua chuỗi số dài hơn 10 chữ số', () => {
    // Mã đơn hàng / số tài khoản không được hiểu nhầm thành SĐT.
    expect(svc.extractPhone('mã đơn 0987654321000')).toBeUndefined();
  });

  it('bỏ qua đầu số không hợp lệ', () => {
    expect(svc.extractPhone('0123456789')).toBeUndefined();
  });

  it('trả undefined khi không có số', () => {
    expect(svc.extractPhone('cho em hỏi còn phòng không ạ')).toBeUndefined();
  });
});
