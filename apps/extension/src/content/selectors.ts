// Selector cấu hình được — CHỐNG RỦI RO #1 (Facebook đổi giao diện).
// Khi FB đổi UI, chỉ cần cập nhật ở đây (hoặc tải versioned từ server qua
// GET /extension/selectors) mà không đụng tới logic AI ở server.
//
// LƯU Ý: selector Facebook thay đổi thường xuyên và tuỳ ngôn ngữ/giao diện.
// Đây là ví dụ khởi tạo — đội bảo trì cần đối chiếu DOM thực tế khi triển khai.

export interface FbSelectors {
  messengerThread: string; // container hội thoại đang mở
  messageRow: string; // từng dòng tin nhắn
  messageText: string; // phần text trong 1 dòng
  composer: string; // ô soạn tin để chèn gợi ý
  commentItem: string; // 1 comment dưới bài viết
  commentText: string;
  postText: string; // nội dung bài viết đang mở
}

export const DEFAULT_SELECTORS: FbSelectors = {
  messengerThread: '[role="main"]',
  messageRow: '[role="row"]',
  messageText: '[dir="auto"]',
  composer: '[contenteditable="true"][role="textbox"]',
  commentItem: '[role="article"]',
  commentText: '[dir="auto"]',
  postText: '[data-ad-preview="message"]',
};
