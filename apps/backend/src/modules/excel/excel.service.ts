import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeKey } from '../../common/vietnamese';

export interface ImportError {
  row: number;
  roomCode?: string;
  message: string;
}

export interface ImportResult {
  batchId: string;
  created: number;
  updated: number;
  errors: ImportError[];
  /** Cột bắt buộc bị thiếu trong file — cảnh báo cho admin. */
  missingColumns: string[];
}

/**
 * Bảng tên cột. Mỗi field liệt kê các cách viết header có thể gặp, đã BỎ DẤU
 * và hạ chữ thường.
 *
 * So khớp là exact/prefix, KHÔNG phải substring. Substring từng gây lỗi âm
 * thầm nghiêm trọng: header "Diện tích" bỏ dấu thành "dien tich", chứa "dien",
 * nên bị đọc thành giá điện — và ngược lại "Giá điện" chứa "gia" nên bị đọc
 * thành giá thuê. Phòng 20m2 giá 3.5tr nhập vào thành phòng giá 20đ.
 */
const COLUMN_ALIASES = {
  roomCode: ['ma phong', 'maphong', 'ma', 'room code', 'roomcode', 'code'],
  area: ['khu vuc', 'khuvuc', 'area', 'quan', 'khu'],
  address: ['dia chi', 'diachi', 'address'],
  price: ['gia thue', 'gia phong', 'gia', 'price', 'gia thue/thang'],
  deposit: ['coc', 'tien coc', 'deposit'],
  size: ['dien tich', 'dientich', 'size', 'dt'],
  peopleCount: ['so nguoi o', 'so nguoi', 'songuoi', 'people'],
  roomType: ['loai phong', 'loaiphong', 'type'],
  wc: ['wc', 'nha ve sinh', 'toilet'],
  utilities: ['noi that', 'noithat', 'tien ich', 'tienich'],
  electricityPrice: ['dien', 'gia dien', 'tien dien', 'electric'],
  waterPrice: ['nuoc', 'gia nuoc', 'tien nuoc', 'water'],
  freeHours: ['gio giac', 'giogiac', 'gio', 'hours'],
  parking: ['xe', 'cho de xe', 'de xe', 'parking'],
  petAllowed: ['thu cung', 'thucung', 'pet'],
  status: ['trang thai', 'trangthai', 'tinh trang', 'status'],
  imageLinks: ['link anh', 'anh', 'hinh', 'link hinh', 'image', 'images'],
  videoLinks: ['link video', 'video', 'clip'],
  managerName: ['nguoi phu trach', 'phu trach', 'manager'],
  note: ['ghi chu', 'ghichu', 'note'],
} as const;

type ColumnField = keyof typeof COLUMN_ALIASES;

/** Không có các cột này thì dữ liệu phòng vô dụng cho việc tư vấn. */
const REQUIRED_COLUMNS: ColumnField[] = ['roomCode', 'area', 'price', 'status'];

// Đọc file Excel phòng trọ -> chuẩn hoá -> upsert theo roomCode.
@Injectable()
export class ExcelService {
  private readonly logger = new Logger(ExcelService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importBuffer(
    buffer: Buffer,
    fileName?: string,
    userId?: string,
  ): Promise<ImportResult> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error('File Excel không có sheet nào');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheetName],
    );

    // Lập bản đồ cột MỘT LẦN từ header, thay vì dò lại trên từng dòng.
    const columnMap = this.mapColumns(rows[0] ?? {});
    const missingColumns = REQUIRED_COLUMNS.filter(
      (f) => !columnMap.has(f),
    ).map((f) => f as string);

    const batch = await this.prisma.importBatch.create({
      data: { source: 'excel', fileName, createdBy: userId },
    });

    const errors: ImportError[] = [];
    const parsed: Prisma.RoomUncheckedCreateInput[] = [];
    const seenCodes = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // +1 cho header, +1 vì Excel đếm từ 1
      try {
        const data = this.normalize(rows[i], columnMap, batch.id);
        if (!data.roomCode) throw new Error('Thiếu mã phòng');
        if (!data.area) throw new Error('Thiếu khu vực');
        if (!data.price || data.price <= 0)
          throw new Error('Giá thuê không hợp lệ');

        // Trùng mã trong cùng file: báo lỗi thay vì để dòng sau ghi đè âm thầm.
        if (seenCodes.has(data.roomCode)) {
          throw new Error(`Mã phòng ${data.roomCode} bị trùng trong file`);
        }
        seenCodes.add(data.roomCode);
        parsed.push(data);
      } catch (e) {
        errors.push({
          row: rowNumber,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Biết trước mã nào đã tồn tại để đếm created/updated chính xác mà không
    // phải findUnique từng dòng.
    const existing = await this.prisma.room.findMany({
      where: { roomCode: { in: parsed.map((p) => p.roomCode) } },
      select: { roomCode: true },
    });
    const existingCodes = new Set(existing.map((r) => r.roomCode));

    let created = 0;
    let updated = 0;
    for (const data of parsed) {
      try {
        await this.prisma.room.upsert({
          where: { roomCode: data.roomCode },
          create: data,
          update: data,
        });
        if (existingCodes.has(data.roomCode)) updated++;
        else created++;
      } catch (e) {
        errors.push({
          row: -1,
          roomCode: data.roomCode,
          message: `Lỗi ghi DB: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: { created, updated, errors: errors as unknown as Prisma.JsonArray },
    });

    if (missingColumns.length) {
      this.logger.warn(
        `Import ${fileName}: thiếu cột bắt buộc ${missingColumns.join(', ')}`,
      );
    }

    return { batchId: batch.id, created, updated, errors, missingColumns };
  }

  /**
   * Dò header -> tên cột thật. Ưu tiên khớp chính xác, sau đó mới khớp tiền
   * tố; không bao giờ khớp substring tuỳ tiện.
   */
  private mapColumns(sampleRow: Record<string, unknown>): Map<
    ColumnField,
    string
  > {
    const headers = Object.keys(sampleRow).map((h) => ({
      raw: h,
      norm: normalizeKey(h),
    }));
    const map = new Map<ColumnField, string>();
    const taken = new Set<string>();

    for (const pass of ['exact', 'prefix'] as const) {
      for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (map.has(field as ColumnField)) continue;
        const hit = headers.find(
          (h) =>
            !taken.has(h.raw) &&
            (aliases as readonly string[]).some((a) =>
              pass === 'exact' ? h.norm === a : h.norm.startsWith(a),
            ),
        );
        if (hit) {
          map.set(field as ColumnField, hit.raw);
          taken.add(hit.raw);
        }
      }
    }
    return map;
  }

  // Chuẩn hoá 1 dòng Excel -> đối tượng Room.
  private normalize(
    row: Record<string, unknown>,
    columnMap: Map<ColumnField, string>,
    batchId: string,
  ): Prisma.RoomUncheckedCreateInput {
    const g = (field: ColumnField): string => {
      const key = columnMap.get(field);
      if (!key) return '';
      return String(row[key] ?? '').trim();
    };

    const price = this.parseMoney(g('price'));
    const people = this.parsePeopleRange(g('peopleCount'));
    const wcRaw = g('wc');

    return {
      roomCode: g('roomCode').toUpperCase(),
      area: g('area'),
      address: g('address') || null,
      price,
      deposit: this.parseDeposit(g('deposit'), price),
      size: this.parseSize(g('size')),
      peopleCountMin: people.min,
      peopleCountMax: people.max,
      roomType: g('roomType') || null,
      wc: wcRaw ? (/rieng/.test(normalizeKey(wcRaw)) ? 'rieng' : 'chung') : null,
      utilities: this.parseUtilities(
        `${g('utilities')} ${g('roomType')}`, // "gác" thường nằm ở cột loại phòng
      ),
      electricityPrice: this.parseMoney(g('electricityPrice')) || null,
      waterPrice: this.parseMoney(g('waterPrice')) || null,
      freeHours: this.parseFreeHours(g('freeHours')),
      parking: this.parseYesNo(g('parking')),
      petAllowed: this.parseYesNo(g('petAllowed')),
      status: this.parseStatus(g('status')),
      imageLinks: this.parseLinks(g('imageLinks')),
      videoLinks: this.parseLinks(g('videoLinks')),
      managerName: g('managerName') || null,
      note: g('note') || null,
      importBatchId: batchId,
    };
  }

  /**
   * Đọc số tiền VND từ nhiều cách viết: "3.500.000", "3tr5", "3,5tr", "3500000".
   * Trả 0 nếu không đọc được (bên gọi tự quyết định coi đó là lỗi hay không).
   */
  parseMoney(s: string): number {
    if (!s) return 0;
    const low = normalizeKey(s).replace(/\s/g, '');

    // "3tr5" / "3.5tr" / "3tr" / "3tr500" / "3 triệu 5" (đã bỏ dấu + bỏ space).
    // "trieu" phải đứng trước "tr" trong alternation, nếu không "3trieu5" chỉ
    // khớp "tr" rồi bỏ lại "ieu5" và ra 3.000.000 thay vì 3.500.000.
    const tr = low.match(/([\d.,]+)(?:trieu|tr)(\d{1,3})?/);
    if (tr) {
      const whole = parseFloat(tr[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
      // Phần lẻ tính theo SỐ CHỮ SỐ: "5"->500k, "50"->500k, "500"->500k.
      // Chia cứng cho 10 như trước sẽ biến "3tr50" thành 8 triệu.
      const frac = tr[2] ? Number(tr[2]) * 10 ** (6 - tr[2].length) : 0;
      return Math.round((isNaN(whole) ? 0 : whole) * 1_000_000 + frac);
    }

    const digits = low.replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  /** Cọc thường ghi "1 tháng" / "2 tháng" thay vì số tiền. */
  private parseDeposit(s: string, price: number): number | null {
    if (!s) return null;
    const months = normalizeKey(s).match(/^(\d+)\s*thang/);
    if (months) return Number(months[1]) * price;
    return this.parseMoney(s) || null;
  }

  private parseSize(s: string): number | null {
    if (!s) return null;
    const m = s.match(/\d+/);
    return m ? Number(m[0]) : null;
  }

  /** "1-2 người" / "2 người" / "1 – 2" -> { min, max }. */
  private parsePeopleRange(s: string): {
    min: number | null;
    max: number | null;
  } {
    if (!s) return { min: null, max: null };
    // Bắt cả gạch nối thường, gạch ngang dài và gạch en.
    const nums = s.match(/\d+/g);
    if (!nums?.length) return { min: null, max: null };
    const values = nums.map(Number);
    return {
      min: values[0],
      max: values.length > 1 ? values[values.length - 1] : values[0],
    };
  }

  private parseStatus(s: string): RoomStatus {
    const low = normalizeKey(s);
    if (!low) return RoomStatus.AVAILABLE;
    if (/coc|deposit/.test(low)) return RoomStatus.DEPOSITED;
    if (/thue|rented|da thue|het/.test(low)) return RoomStatus.RENTED;
    return RoomStatus.AVAILABLE;
  }

  private parseUtilities(s: string): string[] {
    const low = normalizeKey(s);
    const out: string[] = [];
    if (/may lanh|dieu hoa/.test(low)) out.push('may_lanh');
    if (/tu lanh/.test(low)) out.push('tu_lanh');
    if (/nem/.test(low)) out.push('nem');
    if (/gac/.test(low)) out.push('gac');
    return out;
  }

  /** Mặc định giờ tự do; chỉ tắt khi ghi rõ là có khoá cổng/giờ giới nghiêm. */
  private parseFreeHours(s: string): boolean {
    const low = normalizeKey(s);
    if (!low) return true;
    if (/khoa cong|gioi nghiem|gio giac co/.test(low)) return false;
    return /tu do/.test(low) || !/khong/.test(low);
  }

  private parseYesNo(s: string): boolean {
    const low = normalizeKey(s);
    if (!low) return false;
    if (/^(khong|ko|no|0|-)$/.test(low)) return false;
    return /co|yes|1|x/.test(low);
  }

  private parseLinks(s: string): string[] {
    return s
      ? s
          .split(/[,;\n\s]+/)
          .map((x) => x.trim())
          .filter((x) => /^https?:\/\//i.test(x))
      : [];
  }
}
