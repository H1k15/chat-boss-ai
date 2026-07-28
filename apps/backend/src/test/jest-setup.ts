// Chạy TRƯỚC mỗi test suite (setupFilesAfterEnv).
//
// Tắt log của Nest trong test cho output sạch. Nhiều test cố tình kích lỗi để
// kiểm tra nhánh xử lý — ví dụ geocode.service.spec dùng `mockRejectedValue`
// giả timeout, khiến GeocodeService.logger.warn in ra "AbortError: timeout".
// Đó là MOCK, KHÔNG phải gọi mạng thật; log này chỉ gây hiểu nhầm là test đang
// chạm Nominatim. Tắt để khỏi nhiễu.
import { Logger } from '@nestjs/common';

Logger.overrideLogger(false);
