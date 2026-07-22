import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { google } from 'googleapis';
import { ExcelService, ImportResult } from '../excel/excel.service';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// Đồng bộ phòng từ Google Sheet. Đọc dải ô -> dòng object -> ĐƯA VÀO CHUNG
// pipeline chuẩn hoá/upsert của ExcelService (importRows), nên logic phân tích
// và ràng buộc dữ liệu giống hệt import Excel.
@Injectable()
export class SheetsService {
  constructor(private readonly excel: ExcelService) {}

  async sync(
    spreadsheetId: string,
    range: string,
    userId?: string,
  ): Promise<ImportResult> {
    const auth = this.buildAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = res.data.values ?? [];
    if (values.length < 2) {
      throw new BadRequestException(
        'Sheet rỗng hoặc chỉ có dòng tiêu đề — không có dữ liệu để đồng bộ',
      );
    }

    // Dòng đầu là header; các dòng sau ghép thành object header->giá trị.
    const header = values[0].map((h) => String(h ?? ''));
    const rows = values.slice(1).map((r) => {
      const obj: Record<string, unknown> = {};
      header.forEach((h, i) => {
        obj[h] = r[i] ?? '';
      });
      return obj;
    });

    return this.excel.importRows(rows, 'google_sheet', spreadsheetId, userId);
  }

  // Xác thực bằng service account. Chưa cấu hình thì báo rõ thay vì lỗi mơ hồ.
  // GOOGLE_SERVICE_ACCOUNT_JSON nhận CẢ HAI: nội dung JSON (bắt đầu bằng "{")
  // hoặc đường dẫn tới file key (khớp giá trị mẫu trong .env.example).
  private buildAuth() {
    const val = (
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      ''
    ).trim();

    if (!val) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình Google service account (đặt GOOGLE_SERVICE_ACCOUNT_JSON ' +
          'trong .env — nội dung JSON hoặc đường dẫn file key — và chia sẻ Sheet ' +
          'cho email service account).',
      );
    }

    if (val.startsWith('{')) {
      try {
        return new google.auth.GoogleAuth({
          credentials: JSON.parse(val),
          scopes: SCOPES,
        });
      } catch {
        throw new ServiceUnavailableException(
          'GOOGLE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ',
        );
      }
    }
    // Là đường dẫn file: nếu file chưa có (ví dụ vẫn để giá trị mẫu trong .env)
    // thì đây là trạng thái "chưa cấu hình" -> báo rõ thay vì lỗi ENOENT 500.
    if (!existsSync(val)) {
      throw new ServiceUnavailableException(
        `Chưa có file key Google service account tại "${val}". Đặt ` +
          'GOOGLE_SERVICE_ACCOUNT_JSON trỏ đúng file (hoặc dán JSON), và chia ' +
          'sẻ Sheet cho email service account.',
      );
    }
    return new google.auth.GoogleAuth({ keyFile: val, scopes: SCOPES });
  }
}
