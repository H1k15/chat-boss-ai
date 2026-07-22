import { Controller, Get } from '@nestjs/common';

// Selector Facebook cấu hình từ server — CHỐNG RỦI RO #1 (FB đổi giao diện).
// Extension tải bản này thay vì hard-code, nên khi FB đổi UI chỉ cần sửa ở đây
// và tăng version, không phải build lại và phát hành extension.
//
// LƯU Ý: đây là giá trị ví dụ, phải đối chiếu DOM Messenger thật khi triển khai.
const SELECTORS = {
  version: 1,
  selectors: {
    messengerThread: '[role="main"]',
    messageRow: '[role="row"]',
    messageText: '[dir="auto"]',
    composer: '[contenteditable="true"][role="textbox"]',
    commentItem: '[role="article"]',
    commentText: '[dir="auto"]',
    postText: '[data-ad-preview="message"]',
  },
};

@Controller('extension')
export class ExtensionController {
  @Get('selectors')
  selectors() {
    return SELECTORS;
  }
}
