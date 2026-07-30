import {
  fixMojibake,
  guessStaffName,
  buildGoldPairs,
  parseFbHtmlThread,
  parseFbHtmlTime,
  isNoiseContent,
} from './fb-history';

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

  it('isNoiseContent: loại tin hệ thống Facebook, giữ câu người gõ', () => {
    expect(isNoiseContent('You can now message and call each other and see info')).toBe(true);
    expect(isNoiseContent('Đặng Hải sent an attachment.')).toBe(true);
    expect(isNoiseContent('')).toBe(true);
    expect(isNoiseContent('mình gửi bạn ảnh phòng ạ')).toBe(false);
    expect(isNoiseContent('còn phòng không ạ')).toBe(false);
  });

  it('buildGoldPairs: loại tin hệ thống khỏi cặp vàng', () => {
    const thread = {
      title: 't',
      messages: [
        { sender_name: 'Khach', content: 'còn phòng ko ạ', timestamp_ms: 1 },
        { sender_name: 'NV', content: 'You can now message and call each other', timestamp_ms: 2 },
        { sender_name: 'NV', content: 'còn nhé bạn', timestamp_ms: 3 },
      ],
    };
    const pairs = buildGoldPairs(thread, 'NV');
    expect(pairs.length).toBe(1);
    expect(pairs[0].reply).toBe('còn nhé bạn');
  });

  it('parseFbHtmlTime: parse "Mon DD, YYYY h:mm:ss am/pm" -> ms', () => {
    const ms = parseFbHtmlTime('Mar 06, 2024 6:59:46 pm');
    expect(typeof ms).toBe('number');
    expect(parseFbHtmlTime('rác lung tung')).toBeUndefined();
  });

  it('parseFbHtmlThread: đọc HTML DYI -> thread có người gửi/nội dung/thời gian', () => {
    // Mô phỏng cấu trúc thật: <section class="_a6-g"> + <h2 _a6-h> + div _a6-p + div _a72d.
    const html = `<html><head><title>Participants: Facebook user and Đặng Hải</title></head><body>
<div class="_a705">
  <section class="_a6-g" aria-labelledby="x">
    <h2 class="_2ph_ _a6-h _a6-i" id="x">Đặng Hải</h2>
    <div class="_2ph_ _a6-p"><div><div></div><div>Mình gửi bạn ảnh phòng ạ</div></div></div>
    <footer class="_3-94 _a6-o"><div class="_a72d">Mar 06, 2024 6:59:46 pm</div></footer>
  </section>
  <section class="_a6-g" aria-labelledby="y">
    <h2 class="_2ph_ _a6-h _a6-i" id="y">Facebook user</h2>
    <div class="_2ph_ _a6-p"><div><div>còn phòng không ạ</div></div></div>
    <footer class="_3-94 _a6-o"><div class="_a72d">Mar 06, 2024 6:59:33 pm</div></footer>
  </section>
</div></body></html>`;
    const t = parseFbHtmlThread(html);
    expect(t.title).toBe('Facebook user and Đặng Hải');
    expect(t.messages).toHaveLength(2);
    expect(t.messages![0]).toMatchObject({
      sender_name: 'Đặng Hải',
      content: 'Mình gửi bạn ảnh phòng ạ',
    });
    expect(typeof t.messages![0].timestamp_ms).toBe('number');
    expect(t.messages![1].sender_name).toBe('Facebook user');
    expect(t.messages![1].content).toBe('còn phòng không ạ');

    // Đầu-cuối: HTML -> cặp vàng (khách hỏi -> NV trả lời).
    const pairs = buildGoldPairs(t, 'Đặng Hải');
    expect(pairs.length).toBe(1);
    expect(pairs[0].reply).toBe('Mình gửi bạn ảnh phòng ạ');
    expect(pairs[0].conversation.at(-1)?.text).toBe('còn phòng không ạ');
  });
});
