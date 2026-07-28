/**
 * Bộ mẫu câu trả lời (reply_templates) — dữ liệu bạn tự soạn theo giọng đội mình.
 *
 * CÁCH DÙNG: sửa nội dung bên dưới, rồi chạy lại:
 *   pnpm --filter @cba/backend seed:templates
 * Script xoá sạch mẫu cũ và nạp lại toàn bộ — sửa xong nạp lại là AI dùng ngay
 * ở lần gọi /ai/suggest tiếp theo (không cần train, không cần khởi động lại).
 *
 * ================== BA QUY TẮC BẮT BUỘC (vi phạm -> câu bị CHẶN) ==================
 *
 * 1. KHÔNG ghi số tiền cụ thể. SafetyGuard chặn mọi số tiền không truy được về
 *    phòng đã match. Dùng chỗ trống {{gia}}, {{coc}} — AI điền số thật từ DB.
 *      ✗ "Phòng này 3tr5/tháng nhé"
 *      ✓ "Phòng này giá {{gia}}/tháng, cọc {{coc}} anh nhé"
 *
 * 2. KHÔNG ghi số điện thoại (kể cả hotline). Muốn để lại liên hệ thì viết
 *    "em gửi số qua tin nhắn riêng nhé".
 *
 * 3. Giữ NGẮN — dưới 200 ký tự. Mẫu dài kéo câu AI sinh ra vượt ngưỡng 600.
 *
 * ================== MẸO ==================
 * - Trong 5 mẫu cùng một ý định, viết KHÁC GIỌNG nhau (ngắn gọn / thân mật /
 *   có hỏi ngược). AI học biên độ, không lặp một khuôn. Hệ thống chỉ lấy 5 mẫu
 *   đang bật (isActive) cho mỗi ý định.
 * - Viết như tin nhắn Facebook thật: "dạ", "ạ", "nhé". Đừng viết văn email.
 * - Kết bằng câu hỏi mở để giữ mạch: "anh cần phòng cho mấy người ạ?"
 *
 * Chỗ trống AI hiểu được: {{gia}} {{coc}} {{dia_chi}} {{dien_tich}} {{ma_phong}}
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// intent: một trong 11 giá trị của enum CustomerIntent (schema.prisma:45).
// label: nhãn nội bộ để admin dễ nhận ra mẫu, không đưa vào prompt.
// content: nội dung mẫu — thứ AI tham khảo để bắt chước giọng.
type TemplateSeed = { intent: string; label: string; content: string };

const TEMPLATES: TemplateSeed[] = [
  // ============ CỐT LÕI — soạn kỹ nhất, nên đủ 5 mẫu mỗi ý định ============

  // Khách hỏi giá
  {
    intent: 'ASK_PRICE',
    label: 'Giá - ngắn gọn',
    content: 'Dạ phòng này giá {{gia}}/tháng, cọc {{coc}} anh nhé.',
  },
  {
    intent: 'ASK_PRICE',
    label: 'Giá - kèm hỏi ngược',
    content:
      'Phòng {{ma_phong}} giá {{gia}}/tháng ạ. Anh cần phòng cho mấy người để em tư vấn thêm ạ?',
  },
  {
    intent: 'ASK_PRICE',
    label: 'Giá - thân mật',
    content:
      'Dạ giá {{gia}}/tháng thôi ạ, cọc {{coc}} là mình dọn vào ở được luôn anh nhé.',
  },
  {
    intent: 'ASK_PRICE',
    label: 'Giá - hỏi thêm chi phí',
    content:
      'Dạ phòng {{gia}}/tháng, cọc {{coc}} ạ. Anh cần em gửi thêm giá điện nước, mạng không ạ?',
  },
  {
    intent: 'ASK_PRICE',
    label: 'Giá - dẫn qua xem',
    content:
      'Dạ {{gia}}/tháng nha anh. Anh thấy hợp thì em sắp lịch qua xem phòng thực tế cho chắc nhé ạ?',
  },

  // Khách hỏi còn phòng không
  {
    intent: 'ASK_AVAILABILITY',
    label: 'Còn phòng - có phòng match',
    content:
      'Dạ bên em còn phòng khu {{dia_chi}} phù hợp với anh nè, diện tích {{dien_tich}}m² ạ.',
  },
  {
    intent: 'ASK_AVAILABILITY',
    label: 'Còn phòng - hỏi nhu cầu',
    content:
      'Dạ còn phòng anh nhé. Anh đang tìm khu nào và tầm giá bao nhiêu để em lọc cho đúng ạ?',
  },
  {
    intent: 'ASK_AVAILABILITY',
    label: 'Còn phòng - mời xem',
    content:
      'Dạ còn phòng {{ma_phong}} khu {{dia_chi}} anh ơi. Anh sắp xếp qua xem trực tiếp cho dễ hình dung nhé ạ?',
  },
  {
    intent: 'ASK_AVAILABILITY',
    label: 'Còn phòng - hỏi thời điểm',
    content:
      'Dạ còn nha anh. Mình cần chuyển vào tầm khi nào để em giữ phòng phù hợp cho ạ?',
  },
  {
    intent: 'ASK_AVAILABILITY',
    label: 'Còn phòng - hỏi số người',
    content:
      'Dạ dạ còn phòng anh nhé. Anh đang cần cho mấy người ở để em chọn phòng vừa vặn ạ?',
  },

  // Khách hỏi địa chỉ
  {
    intent: 'ASK_ADDRESS',
    label: 'Địa chỉ - cơ bản',
    content: 'Dạ phòng ở {{dia_chi}} anh nhé, khu này đi lại tiện lắm ạ.',
  },
  {
    intent: 'ASK_ADDRESS',
    label: 'Địa chỉ - kèm mời xem',
    content:
      'Dạ phòng ở {{dia_chi}} anh nhé. Anh tiện qua xem lúc nào để em hẹn dẫn đi ạ?',
  },
  {
    intent: 'ASK_ADDRESS',
    label: 'Địa chỉ - hỏi điểm mốc',
    content:
      'Dạ phòng bên {{dia_chi}} ạ. Anh hay đi làm hay đi học khu nào để em xem có gần tiện cho mình không ạ?',
  },
  {
    intent: 'ASK_ADDRESS',
    label: 'Địa chỉ - gửi định vị',
    content: 'Dạ ở {{dia_chi}} anh nhé, để em gửi mình vị trí bản đồ cho dễ tìm ạ.',
  },
  {
    intent: 'ASK_ADDRESS',
    label: 'Địa chỉ - hỏi cần chỉ đường',
    content:
      'Dạ phòng {{ma_phong}} nằm ở {{dia_chi}} anh nhé. Anh cần em chỉ đường chi tiết hơn không ạ?',
  },

  // Khách muốn xem phòng
  {
    intent: 'WANT_VIEWING',
    label: 'Hẹn xem - chốt lịch',
    content:
      'Dạ được ạ, anh tiện xem phòng lúc nào để em sắp lịch dẫn đi ạ? Sáng hay chiều tiện hơn với anh?',
  },
  {
    intent: 'WANT_VIEWING',
    label: 'Hẹn xem - xin thông tin',
    content:
      'Dạ em sắp lịch cho mình nhé. Anh cho em xin tên và khung giờ tiện là được ạ.',
  },
  {
    intent: 'WANT_VIEWING',
    label: 'Hẹn xem - hỏi hôm nay/mai',
    content:
      'Dạ được luôn anh nhé! Anh qua xem hôm nay hay mai tiện hơn để em giữ lịch ạ?',
  },
  {
    intent: 'WANT_VIEWING',
    label: 'Hẹn xem - trấn an dẫn đi',
    content:
      'Dạ anh cứ qua xem thoải mái nha, có em dẫn đi tận nơi. Anh cho em xin khung giờ tiện là được ạ.',
  },

  // ============ QUAN TRỌNG — 3-5 mẫu ============

  // Khách hỏi tiện ích (máy lạnh, gác, wc riêng, giờ giấc...)
  {
    intent: 'ASK_UTILITIES',
    label: 'Tiện ích - liệt kê',
    content:
      'Dạ phòng có đầy đủ tiện ích anh nhé, wc riêng, giờ giấc tự do. Anh cần thêm máy lạnh hay gác không ạ?',
  },
  {
    intent: 'ASK_UTILITIES',
    label: 'Tiện ích - hỏi cần gì',
    content:
      'Dạ anh cần tiện ích gì cụ thể ạ (máy lạnh, gác lửng, máy giặt...) để em kiểm tra phòng nào có cho mình nhé?',
  },
  {
    intent: 'ASK_UTILITIES',
    label: 'Tiện ích - mời xem thực tế',
    content:
      'Dạ nội thất phòng {{ma_phong}} em gửi mình xem qua hình trước, rồi qua coi trực tiếp cho chắc nha anh.',
  },
  {
    intent: 'ASK_UTILITIES',
    label: 'Tiện ích - giờ giấc gửi xe',
    content:
      'Dạ khoản giờ giấc với gửi xe anh yên tâm nhé, để em nói rõ điều khoản của phòng này cho mình ạ.',
  },

  // Khách hỏi hình ảnh / video phòng
  {
    intent: 'ASK_MEDIA',
    label: 'Hình ảnh',
    content: 'Dạ em gửi anh vài hình phòng thực tế nhé, anh xem rồi mình hẹn qua coi trực tiếp ạ.',
  },
  {
    intent: 'ASK_MEDIA',
    label: 'Video',
    content:
      'Dạ em gửi anh clip quay phòng cho dễ hình dung nhé, xem xong mình hẹn qua coi thực tế ạ.',
  },
  {
    intent: 'ASK_MEDIA',
    label: 'Ảnh - kèm chốt nhẹ',
    content:
      'Dạ để em gửi mình ít hình phòng thật nha. Anh xem thấy ưng thì em giữ phòng cho ạ.',
  },

  // Khách để lại số điện thoại (KHÔNG lặp lại số của khách trong câu)
  {
    intent: 'LEFT_PHONE',
    label: 'Nhận SĐT',
    content: 'Dạ em nhận được thông tin của anh rồi ạ, em sẽ liên hệ lại anh sớm nhất nhé!',
  },
  {
    intent: 'LEFT_PHONE',
    label: 'Nhận SĐT - hẹn gọi',
    content:
      'Dạ em nhận được số của anh rồi ạ. Lát em gọi lại tư vấn kỹ hơn cho mình nhé!',
  },
  {
    intent: 'LEFT_PHONE',
    label: 'Nhận SĐT - hỏi giờ tiện',
    content:
      'Dạ em lưu thông tin của anh rồi nha. Anh tiện nghe máy khung giờ nào để em gọi lại ạ?',
  },

  // ============ ĐƠN GIẢN — 2-3 mẫu ============

  // Chào hỏi
  {
    intent: 'GREETING',
    label: 'Chào - mở đầu',
    content: 'Dạ em chào anh, anh đang tìm phòng khu nào để em tư vấn giúp anh ạ?',
  },
  {
    intent: 'GREETING',
    label: 'Chào - hỏi khu + giá',
    content:
      'Dạ em chào anh ạ! Anh đang tìm phòng khu nào, tầm giá bao nhiêu để em lọc nhanh cho mình nhé?',
  },
  {
    intent: 'GREETING',
    label: 'Chào - hỏi số người + thời điểm',
    content:
      'Dạ em chào anh, anh cần phòng cho mấy người và khi nào dọn vào để em tư vấn đúng ý ạ?',
  },

  // Nói chuyện phiếm
  {
    intent: 'SMALL_TALK',
    label: 'Phiếm - kéo về chủ đề',
    content: 'Dạ hihi. Anh đang cần tìm phòng gấp không ạ, để em ưu tiên lọc phòng phù hợp cho anh nè.',
  },
  {
    intent: 'SMALL_TALK',
    label: 'Phiếm - vui vẻ kéo về',
    content:
      'Dạ anh vui tính ghê ạ hihi. Mà anh đang cần tìm phòng khu nào để em ngó thử có phòng hợp không nhé?',
  },
  {
    intent: 'SMALL_TALK',
    label: 'Phiếm - chốt nhẹ',
    content:
      'Dạ dạ ạ. Anh cứ nhắn em nhu cầu phòng nha, em hỗ trợ tìm nhanh cho mình ạ.',
  },

  // ============ ÍT DÙNG — 1-2 mẫu ============

  // Không liên quan tư vấn phòng
  {
    intent: 'IRRELEVANT',
    label: 'Không liên quan',
    content: 'Dạ cái này em chưa hỗ trợ được ạ. Anh có đang cần tìm phòng trọ không để em tư vấn giúp ạ?',
  },
  {
    intent: 'IRRELEVANT',
    label: 'Không liên quan - lịch sự',
    content:
      'Dạ phần này em chưa hỗ trợ được ạ. Còn về phòng trọ thì anh cứ hỏi em nhé, em tư vấn nhiệt tình luôn ạ!',
  },

  // Trường hợp khác
  {
    intent: 'OTHER',
    label: 'Khác - hỏi lại',
    content: 'Dạ anh cho em hỏi rõ hơn một chút để em tư vấn đúng ý anh nhé ạ.',
  },
  {
    intent: 'OTHER',
    label: 'Khác - mời nói rõ nhu cầu',
    content: 'Dạ anh nói rõ hơn ý mình chút xíu để em hỗ trợ đúng nhé ạ.',
  },
];

async function main() {
  // Nạp lại được nhiều lần: xoá sạch rồi tạo mới, để lần chạy sau khớp đúng
  // nội dung file này (không tích luỹ mẫu cũ đã xoá khỏi file).
  await prisma.replyTemplate.deleteMany({});
  await prisma.replyTemplate.createMany({
    data: TEMPLATES.map((t) => ({
      intent: t.intent,
      label: t.label,
      content: t.content,
      isActive: true,
    })),
  });

  // Đếm theo ý định để bạn thấy chỗ nào còn mỏng
  const byIntent = TEMPLATES.reduce<Record<string, number>>((acc, t) => {
    acc[t.intent] = (acc[t.intent] ?? 0) + 1;
    return acc;
  }, {});
  // eslint-disable-next-line no-console
  console.log(`Đã nạp ${TEMPLATES.length} mẫu câu:`);
  // eslint-disable-next-line no-console
  console.table(byIntent);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
