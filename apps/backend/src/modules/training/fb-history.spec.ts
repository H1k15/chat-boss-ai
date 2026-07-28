import { fixMojibake, guessStaffName, buildGoldPairs } from './fb-history';

describe('fb-history — xử lý export Facebook DYI', () => {
  it('fixMojibake: sửa mojibake về tiếng Việt', () => {
    const original = 'phòng còn không ạ';
    const mojibaked = Buffer.from(original, 'utf8').toString('latin1'); // mô phỏng lỗi DYI
    expect(fixMojibake(mojibaked)).toBe(original);
    expect(fixMojibake('plain ascii')).toBe('plain ascii');
  });

  it('guessStaffName: người xuất hiện ở nhiều thread nhất = nhân viên', () => {
    const threads = [
      { messages: [{ sender_name: 'NV' }, { sender_name: 'Khach A' }] },
      { messages: [{ sender_name: 'NV' }, { sender_name: 'Khach B' }] },
    ];
    expect(guessStaffName(threads)).toBe('NV');
  });

  it('buildGoldPairs: câu NV sau lượt khách -> 1 cặp (ngữ cảnh + reply)', () => {
    const thread = {
      title: 'Khach A',
      messages: [
        // DYI xếp mới nhất trước:
        { sender_name: 'NV', content: 'Dạ 3 triệu ạ', timestamp_ms: 3 },
        { sender_name: 'Khach A', content: 'bao nhiêu tiền', timestamp_ms: 2 },
        { sender_name: 'Khach A', content: 'còn phòng ko', timestamp_ms: 1 },
      ],
    };
    const pairs = buildGoldPairs(thread, 'NV');
    expect(pairs.length).toBe(1);
    expect(pairs[0].reply).toBe('Dạ 3 triệu ạ');
    expect(pairs[0].conversation.map((t) => t.role)).toEqual(['customer', 'customer']);
    expect(pairs[0].conversation[0].text).toBe('còn phòng ko');
  });

  it('buildGoldPairs: bỏ câu NV mở đầu (không có khách trước) + bỏ tin không chữ', () => {
    const thread = {
      title: 't',
      messages: [
        { sender_name: 'Khach', content: 'hi', timestamp_ms: 2 },
        { sender_name: 'NV', content: 'chào bạn', timestamp_ms: 1 }, // NV mở đầu -> không tính
        { sender_name: 'NV', timestamp_ms: 3 }, // không có content -> bỏ
      ],
    };
    expect(buildGoldPairs(thread, 'NV').length).toBe(0);
  });
});
