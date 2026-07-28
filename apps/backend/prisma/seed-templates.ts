/**
 * Bộ mẫu câu trả lời (reply_templates) — dữ liệu bạn tự soạn theo giọng đội mình.
 *
 * CÁCH DÙNG: sửa nội dung bên dưới, rồi chạy lại:
 *   pnpm --filter @cba/backend seed:templates
 * Script xoá sạch mẫu cũ và nạp lại toàn bộ — sửa xong nạp lại là AI dùng ngay
 * ở lần gọi /ai/suggest tiếp theo (không cần train, không cần khởi động lại).
 *
 * NGUỒN: viết tay + khai thác từ mô phỏng 1000+ lượt hội thoại (nhiều persona tự
 * chat kiểu người thật), đã LỌC AN TOÀN: bỏ mọi câu khẳng định tiện ích/vị trí cụ
 * thể (máy lạnh, gác, camera, wifi, gần chợ/trường...) vì đó là bịa dữ liệu phòng;
 * bỏ câu tạo urgency/cam kết "giữ phòng" vì SafetyGuard chặn. Chỉ giữ câu hỏi ngược,
 * trấn an chung, dùng placeholder, xử lý mặc cả / hợp đồng / chống lừa đảo.
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
 * - KHÔNG khẳng định tiện ích/khoảng cách cụ thể ("có máy lạnh", "gần trường",
 *   "cách 2km") — để AI tự nêu theo dữ liệu thật của từng phòng. Câu mẫu chỉ dạy
 *   GIỌNG, không dạy nội dung bịa.
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
  // ============ CỐT LÕI — soạn kỹ nhất, 5-6 mẫu mỗi ý định ============

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
  {
    intent: 'ASK_PRICE',
    label: 'Giá - xử lý mặc cả',
    content:
      'Dạ để em hỏi lại chủ nhà xem có linh động giá được không rồi báo lại mình nha, anh/chị chờ em chút ạ.',
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
      'Dạ còn nha anh. Mình cần chuyển vào tầm khi nào để em tư vấn phòng phù hợp cho ạ?',
  },
  {
    intent: 'ASK_AVAILABILITY',
    label: 'Còn phòng - hỏi số người',
    content:
      'Dạ dạ còn phòng anh nhé. Anh đang cần cho mấy người ở để em chọn phòng vừa vặn ạ?',
  },
  {
    intent: 'ASK_AVAILABILITY',
    label: 'Còn phòng - xin khu vực',
    content:
      'Dạ hiện bên em còn phòng trống ạ, anh/chị cho em xin khu vực mình muốn tìm để em tư vấn cho sát nha.',
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
  {
    intent: 'ASK_ADDRESS',
    label: 'Địa chỉ - trấn an minh bạch',
    content:
      'Dạ phòng ở {{dia_chi}} ạ, anh/chị cứ qua xem tận nơi cho yên tâm, em không giấu địa chỉ đâu ạ.',
  },

  // ============ QUAN TRỌNG — 5-6 mẫu ============

  // Khách hỏi tiện ích (máy lạnh, gác, wc riêng, giờ giấc...)
  {
    intent: 'ASK_UTILITIES',
    label: 'Tiện ích - hỏi theo nhu cầu',
    content:
      'Dạ tuỳ phòng sẽ có tiện ích khác nhau anh nhé. Anh cần máy lạnh, gác hay wc riêng để em lọc phòng đúng ý ạ?',
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
  {
    intent: 'ASK_UTILITIES',
    label: 'Tiện ích - minh bạch điện nước',
    content:
      'Dạ điện nước bên em tính theo công tơ thực tế, minh bạch rõ ràng, để em gửi bảng giá cho mình xem nha.',
  },
  {
    intent: 'ASK_UTILITIES',
    label: 'Tiện ích - hỏi ngược',
    content:
      'Dạ để em kiểm tra phòng giúp mình nha, anh/chị cần thêm chỗ để xe hay máy giặt không ạ?',
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
      'Dạ để em gửi mình ít hình phòng thật nha. Anh xem thấy ưng thì mình hẹn qua coi trực tiếp ạ.',
  },
  {
    intent: 'ASK_MEDIA',
    label: 'Ảnh/video - trấn an thật',
    content:
      'Dạ hình với video em gửi là chụp quay thực tế không chỉnh sửa gì đâu ạ, anh/chị xem cho yên tâm nha.',
  },
  {
    intent: 'ASK_MEDIA',
    label: 'Video - hẹn chờ',
    content:
      'Dạ để em xin quay video mới nhất của phòng gửi mình xem cho rõ nha, anh/chị đợi em chút ạ.',
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
  {
    intent: 'LEFT_PHONE',
    label: 'Nhận SĐT - xác nhận lịch',
    content:
      'Dạ em lưu số anh/chị rồi ạ, có gì em nhắn xác nhận lịch xem phòng sớm cho mình nha.',
  },
  {
    intent: 'LEFT_PHONE',
    label: 'Nhận SĐT - chuyên nghiệp',
    content:
      'Dạ em ghi nhận số của anh/chị rồi ạ, lát bên em liên hệ xác nhận lại nhé.',
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
  {
    intent: 'WANT_VIEWING',
    label: 'Hẹn xem - coi khu vực',
    content:
      'Dạ mời anh/chị qua xem phòng trực tiếp cho yên tâm nha, tiện thể coi luôn khu vực xung quanh ạ.',
  },
  {
    intent: 'WANT_VIEWING',
    label: 'Hẹn xem - báo trước',
    content:
      'Dạ vâng, anh/chị qua xem thoải mái ạ, cứ báo em trước giờ để em chuẩn bị đón mình nha.',
  },

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
  {
    intent: 'GREETING',
    label: 'Chào - mời mở',
    content:
      'Dạ em chào anh/chị ạ, bên em đang có phòng nha, anh/chị cần tư vấn gì cứ hỏi em thoải mái ạ.',
  },
  {
    intent: 'GREETING',
    label: 'Chào - hỏi khu vực',
    content:
      'Dạ em chào anh/chị, bên em còn phòng ạ, mình đang cần khu vực nào để em tư vấn cho phù hợp nha?',
  },
  {
    intent: 'GREETING',
    label: 'Chào - giọng chị',
    content:
      'Dạ chào em, chị đây! Em đang cần tìm phòng khu nào để chị tư vấn cho sát nhé?',
  },

  // ============ ĐƠN GIẢN / ÍT DÙNG — 4-5 mẫu ============

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
  {
    intent: 'SMALL_TALK',
    label: 'Phiếm - thong thả',
    content:
      'Dạ được ạ, anh/chị cứ thong thả suy nghĩ nha, có quyết định gì mình nhắn em liền ạ.',
  },
  {
    intent: 'SMALL_TALK',
    label: 'Phiếm - kết thân thiện',
    content:
      'Dạ không có gì ạ, cần hỏi thêm gì cứ nhắn em nhé, chúc mình sớm tìm được phòng ưng ý ạ.',
  },

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
  {
    intent: 'IRRELEVANT',
    label: 'Không liên quan - tập trung',
    content:
      'Dạ cái này em chưa rành lắm ạ, để em tập trung tư vấn phòng cho mình trước nha.',
  },
  {
    intent: 'IRRELEVANT',
    label: 'Không liên quan - chuyên phòng trọ',
    content:
      'Dạ bên em chuyên cho thuê phòng trọ thôi ạ, phần đó em không hỗ trợ được, mong anh/chị thông cảm nha.',
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
  {
    intent: 'OTHER',
    label: 'Khác - hợp đồng',
    content:
      'Dạ mình thuê là có hợp đồng ghi rõ tiền phòng, cọc và thời hạn ạ, anh/chị đọc kỹ em giải thích thêm nha.',
  },
  {
    intent: 'OTHER',
    label: 'Khác - hoàn cọc',
    content:
      'Dạ theo hợp đồng, trả phòng đúng hạn và không hư hỏng gì thì được hoàn cọc đầy đủ ạ, anh/chị yên tâm nha.',
  },
  {
    intent: 'OTHER',
    label: 'Khác - chống lừa đảo',
    content:
      'Dạ anh/chị yên tâm, bên em cho xem phòng trực tiếp trước khi đặt cọc, không ép cọc online đâu ạ.',
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
