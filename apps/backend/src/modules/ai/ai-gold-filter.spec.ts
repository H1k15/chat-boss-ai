import { isUsableGoldReply } from '../training/fb-history';

// Lọc câu gold pair (FB) trước khi bơm làm ví dụ giọng văn cho suggest.
describe('isUsableGoldReply — lọc ví dụ gold pair', () => {
  it('giữ câu tư vấn phòng đúng giọng', () => {
    expect(isUsableGoldReply('hiện tại anh có phòng bên 29 cầu diễn đấy e')).toBe(true);
    expect(isUsableGoldReply('em cần phòng ở luôn hay bao giờ vậy')).toBe(true);
    expect(isUsableGoldReply('phòng còn trống, giá 3 triệu, có gác nhé')).toBe(true);
  });

  it('loại tin tuyển dụng / lạc đề lọt vào thread', () => {
    expect(
      isUsableGoldReply('công ty sumi tuyển nhân viên đi làm ngay lương cao'),
    ).toBe(false);
    expect(isUsableGoldReply('bên em cần tuyển gấp ứng viên đơn hàng Nhật')).toBe(false);
  });

  it('loại câu rỗng / quá ngắn / quá dài / không có tín hiệu nhà trọ', () => {
    expect(isUsableGoldReply('')).toBe(false);
    expect(isUsableGoldReply('ok')).toBe(false);
    expect(isUsableGoldReply('dạ vâng ạ')).toBe(false); // không có từ khoá nhà trọ
    expect(isUsableGoldReply('phòng ' + 'a'.repeat(300))).toBe(false); // quá dài
  });
});
