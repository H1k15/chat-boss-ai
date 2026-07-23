import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { google } from 'googleapis';
import { Prisma, RoomStatus } from '@prisma/client';
import { ExcelService, ImportResult } from '../excel/excel.service';
import { PrismaService } from '../../prisma/prisma.service';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

function deaccentLower(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
function parseMoney(s: unknown): number {
  const d = String(s ?? '').replace(/[^\d]/g, '');
  return d ? parseInt(d, 10) : 0;
}

// Dò loại phòng từ text tự do (cột "Loại phòng" nếu có, hoặc trong nội thất /
// ghi chú). roomType là chữ tự do nên chỉ cần khớp từ khoá phổ biến. Xếp cái
// cụ thể trước (chung cư mini trước "gác"...). Thêm loại mới thì bổ sung dòng.
const ROOM_TYPE_KEYWORDS: [RegExp, string][] = [
  [/studio/, 'studio'],
  [/chung cu mini|ccmn/, 'chung cư mini'],
  [/nguyen can|nguyen cang|cho thue nguyen/, 'nguyên căn'],
  [/duplex/, 'duplex'],
  [/gac xep|gac lung|co gac|gac/, 'gác'],
  [/khep kin/, 'khép kín'],
  [/ve sinh chung|wc chung|nha ve sinh chung|vs chung/, 'vệ sinh chung'],
  [/o ghep|phong ghep/, 'ở ghép'],
];
function detectRoomType(...texts: (string | null | undefined)[]): string | null {
  const hay = deaccentLower(texts.filter(Boolean).join(' '));
  for (const [re, type] of ROOM_TYPE_KEYWORDS) {
    if (re.test(hay)) return type;
  }
  return null;
}

// Đồng bộ phòng từ Google Sheet. Đọc dải ô -> dòng object -> ĐƯA VÀO CHUNG
// pipeline chuẩn hoá/upsert của ExcelService (importRows), nên logic phân tích
// và ràng buộc dữ liệu giống hệt import Excel.
@Injectable()
export class SheetsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SheetsService.name);
  private autoSyncTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly excel: ExcelService,
    private readonly prisma: PrismaService,
  ) {}

  // Tự động đồng bộ Google Sheet theo chu kỳ (mặc định 30 phút). Đặt
  // SHEET_SYNC_INTERVAL_MINUTES=0 trong .env để tắt. Dùng cấu hình đã lưu; chưa
  // cấu hình thì bỏ qua. Lỗi mạng/sheet chỉ log, KHÔNG làm sập tiến trình.
  onModuleInit(): void {
    const minutes = parseInt(
      process.env.SHEET_SYNC_INTERVAL_MINUTES || '30',
      10,
    );
    if (!minutes || minutes <= 0) {
      this.logger.log('Tự động đồng bộ sheet: TẮT');
      return;
    }
    this.autoSyncTimer = setInterval(
      () => void this.autoSync(),
      minutes * 60_000,
    );
    this.logger.log(`Tự động đồng bộ sheet mỗi ${minutes} phút`);
  }

  onModuleDestroy(): void {
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
  }

  private async autoSync(): Promise<void> {
    try {
      const cfg = await this.getConfig();
      if (!cfg) return; // chưa cấu hình sheet -> chưa có gì để đồng bộ
      const r = await this.syncSaved();
      this.logger.log(
        `Tự đồng bộ: +${r.created} thêm, ~${r.updated} cập nhật, -${r.deleted} xoá`,
      );
    } catch (e) {
      this.logger.warn(`Tự đồng bộ lỗi (bỏ qua lần này): ${String(e)}`);
    }
  }

  /**
   * Đồng bộ phòng từ sheet quản lý "kiểu bảng tổng hợp" (như Legacy Home):
   * tiêu đề không ở hàng 1, không có cột mã phòng/khu vực/trạng thái riêng.
   * - Mã phòng = Địa chỉ + số Phòng (duy nhất, ổn định qua các lần đồng bộ)
   * - Khu vực = chính địa chỉ (khách hỏi "Phú Diễn" vẫn khớp nhờ so chuỗi con)
   * - Giá = cột "Giá cho thuê"; Trạng thái = còn (cả sheet là phòng trống)
   * - Nội thất giữ nguyên văn; giá dịch vụ + điều khoản gộp vào note
   */
  // Lưu cấu hình sheet gần nhất để nút "Đồng bộ" ở các màn khác dùng lại
  // (không bắt nhập lại ID/tab mỗi lần).
  private async saveConfig(cfg: {
    spreadsheetId: string;
    sheetName?: string;
    headerRow: number;
  }): Promise<void> {
    await this.prisma.appSetting.upsert({
      where: { key: 'sheet_rooms' },
      update: { value: cfg as unknown as Prisma.InputJsonObject },
      create: { key: 'sheet_rooms', value: cfg as unknown as Prisma.InputJsonObject },
    });
  }

  /** Cấu hình sheet đã lưu (null nếu chưa từng đồng bộ). */
  async getConfig(): Promise<{
    spreadsheetId: string;
    sheetName?: string;
    headerRow: number;
  } | null> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: 'sheet_rooms' },
    });
    return (row?.value as { spreadsheetId: string; sheetName?: string; headerRow: number } | null) ?? null;
  }

  /** Đồng bộ dùng cấu hình đã lưu — cho nút một-cú-bấm ở màn Phòng trọ. */
  async syncSaved(userId?: string) {
    const cfg = await this.getConfig();
    if (!cfg) {
      throw new BadRequestException(
        'Chưa cấu hình Google Sheet. Vào màn Nhập phòng đồng bộ một lần để lưu.',
      );
    }
    return this.syncRooms(cfg.spreadsheetId, cfg.sheetName, cfg.headerRow, userId);
  }

  async syncRooms(
    spreadsheetId: string,
    sheetName: string | undefined,
    headerRow: number,
    userId?: string,
  ): Promise<{
    batchId: string;
    created: number;
    updated: number;
    skipped: number;
    deleted: number;
    errors: { room: string; message: string }[];
  }> {
    await this.saveConfig({ spreadsheetId, sheetName, headerRow });
    const auth = this.buildAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Không cho tên tab -> lấy tab đầu tiên.
    let tab = sheetName;
    if (!tab) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      tab = meta.data.sheets?.[0]?.properties?.title ?? undefined;
    }
    const range = `${tab ? `${tab}!` : ''}A${headerRow}:Z5000`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values ?? [];
    if (rows.length < 2) {
      throw new BadRequestException('Sheet rỗng hoặc không có dữ liệu');
    }

    const header = rows[0].map((h) => deaccentLower(String(h ?? '')));
    const col = (name: string) => header.findIndex((h) => h.includes(name));
    const iAddr = col('dia chi');
    const iRoom = col('phong');
    const iPrice = col('gia cho thue');
    const iFurn = col('noi that');
    const iSvc = col('gia dich vu');
    const iTerm = col('dong tien');
    const iNote = col('ghi chu');
    const iStay = col('thoi gian'); // "Thời gian ở"
    const iSale = col('gia sale') >= 0 ? col('gia sale') : col('sale'); // "Giá sale"
    const iType = col('loai phong'); // "Loại phòng" (studio, gác, phòng thường...)
    if (iAddr < 0 || iRoom < 0 || iPrice < 0) {
      throw new BadRequestException(
        'Thiếu cột bắt buộc: cần có "Địa chỉ", "Phòng", "Giá cho thuê" trong ' +
          `hàng tiêu đề (hàng ${headerRow}).`,
      );
    }

    const batch = await this.prisma.importBatch.create({
      data: { source: 'google_sheet', fileName: spreadsheetId, createdBy: userId },
    });

    const errors: { room: string; message: string }[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    const parsed: {
      roomCode: string;
      roomNumber: string;
      area: string;
      address: string;
      price: number;
      salePrice: number | null;
      stayDuration: string | null;
      roomType: string | null;
      status: RoomStatus;
      furniture: string | null;
      note: string | null;
      importBatchId: string;
    }[] = [];

    for (const r of rows.slice(1)) {
      const addr = String(r[iAddr] ?? '').trim();
      const room = String(r[iRoom] ?? '').trim();
      if (!addr || !room) {
        skipped++;
        continue;
      }
      const price = parseMoney(r[iPrice]);
      const roomCode = `${addr.replace(/\s+/g, ' ')} - P${room}`.slice(0, 180);
      if (seen.has(roomCode)) {
        skipped++;
        continue;
      }
      seen.add(roomCode);
      if (!price) {
        errors.push({ room: roomCode, message: 'Không đọc được giá cho thuê' });
        continue;
      }
      const note = [
        iSvc >= 0 ? r[iSvc] : '',
        iTerm >= 0 ? r[iTerm] : '',
        iNote >= 0 ? r[iNote] : '',
      ]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .join(' | ');
      const stayDuration =
        iStay >= 0 ? String(r[iStay] ?? '').trim() || null : null;
      // "Đã cho thuê / hết phòng" có thể ghi ở cột Thời gian ở HOẶC ghi chú
      // -> UNAVAILABLE, AI sẽ không tư vấn phòng này (room-matcher chỉ lấy
      // AVAILABLE).
      const rentedOut = /da (cho )?thue|het phong|ngung cho thue|khong cho thue/.test(
        deaccentLower(`${stayDuration ?? ''} ${note}`),
      );
      const salePrice = iSale >= 0 ? parseMoney(r[iSale]) : 0;
      const furniture = iFurn >= 0 ? String(r[iFurn] ?? '').trim() || null : null;
      // Loại phòng: ưu tiên cột "Loại phòng"; không có thì DÒ trong nội thất +
      // ghi chú (VD "Gác xép mới sạch" -> gác, "phòng studio" -> studio).
      const explicitType = iType >= 0 ? String(r[iType] ?? '').trim() : '';
      const roomType = explicitType || detectRoomType(furniture, note);
      parsed.push({
        roomCode,
        roomNumber: room,
        area: addr, // khớp chuỗi con -> khách hỏi tên phường vẫn ra
        address: addr,
        price,
        salePrice: salePrice || null, // bỏ trống nếu sheet không có giá sale
        stayDuration,
        roomType: roomType || null,
        status: rentedOut ? RoomStatus.UNAVAILABLE : RoomStatus.AVAILABLE,
        furniture,
        note: note || null,
        importBatchId: batch.id,
      });
    }

    const existing = await this.prisma.room.findMany({
      where: { roomCode: { in: parsed.map((p) => p.roomCode) } },
      select: { roomCode: true },
    });
    const exSet = new Set(existing.map((r) => r.roomCode));
    let created = 0;
    let updated = 0;
    for (const data of parsed) {
      await this.prisma.room.upsert({
        where: { roomCode: data.roomCode },
        create: data,
        update: data,
      });
      exSet.has(data.roomCode) ? updated++ : created++;
    }

    // Xoá phòng đến TỪ GOOGLE SHEET nhưng không còn trong sheet nữa (đã cho
    // thuê / gỡ khỏi bảng). CHỐT AN TOÀN: chỉ xoá khi thực sự đọc được phòng
    // (seen > 0) — sheet đọc ra rỗng thì KHÔNG xoá gì, tránh xoá sạch do lỗi.
    // Chỉ đụng phòng nguồn google_sheet, không đụng phòng nhập tay/Excel.
    let deleted = 0;
    if (seen.size > 0) {
      const stale = await this.prisma.room.findMany({
        where: {
          roomCode: { notIn: Array.from(seen) },
          importBatch: { source: 'google_sheet' },
        },
        select: { id: true },
      });
      if (stale.length) {
        const ids = stale.map((r) => r.id);
        // Gỡ liên kết lịch hẹn trước để không vướng khoá ngoại khi xoá phòng.
        await this.prisma.appointment.updateMany({
          where: { roomId: { in: ids } },
          data: { roomId: null },
        });
        deleted = (
          await this.prisma.room.deleteMany({ where: { id: { in: ids } } })
        ).count;
      }
    }

    // Cấp mã ngắn (R001, R002...) cho phòng chưa có. Mã đã cấp thì GIỮ NGUYÊN
    // qua các lần đồng bộ — làm khoá tra cứu ngắn gọn thay cho roomCode dài.
    const withCode = await this.prisma.room.findMany({
      where: { NOT: { code: null } },
      select: { code: true },
    });
    let nextNo =
      withCode.reduce(
        (m, r) => Math.max(m, parseInt((r.code ?? '').replace(/\D/g, '') || '0', 10)),
        0,
      ) + 1;
    const noCode = await this.prisma.room.findMany({
      where: { code: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    for (const r of noCode) {
      await this.prisma.room.update({
        where: { id: r.id },
        data: { code: `R${String(nextNo++).padStart(3, '0')}` },
      });
    }

    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: { created, updated, errors: errors as unknown as object },
    });

    return { batchId: batch.id, created, updated, skipped, deleted, errors };
  }

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
    // Là đường dẫn file. cwd khi chạy là apps/backend, nên đường dẫn tương đối
    // (VD ./secrets/...) hiểu theo cwd sẽ trật — thử cả gốc repo (../../).
    const candidates = [val, resolve(process.cwd(), '../..', val)];
    const keyFile = candidates.find((p) => existsSync(p));
    if (!keyFile) {
      throw new ServiceUnavailableException(
        `Chưa có file key Google service account tại "${val}". Đặt ` +
          'GOOGLE_SERVICE_ACCOUNT_JSON trỏ đúng file (hoặc dán JSON), và chia ' +
          'sẻ Sheet cho email service account.',
      );
    }
    return new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
  }
}
