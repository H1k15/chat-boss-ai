import { Injectable } from '@nestjs/common';
import { Room, RoomStatus } from '@prisma/client';
import { ExtractedInfo, MatchedRoom } from '@cba/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { deaccent } from '../../../common/vietnamese';

/**
 * Một yêu cầu của khách được thoả mãn bởi phòng nào.
 *
 * Không phải mã nào cũng nằm trong mảng `utilities`: WC riêng, giờ giấc, chỗ
 * để xe và thú cưng là các CỘT RIÊNG trong bảng rooms. Bảng ánh xạ này là nơi
 * duy nhất biết điều đó, để việc chấm điểm không bỏ sót phòng hợp lệ.
 */
const REQUIREMENT_PREDICATES: Record<string, (room: Room) => boolean> = {
  gac: (r) => r.utilities.includes('gac') || /gác/i.test(r.roomType ?? ''),
  wc_rieng: (r) => r.wc === 'rieng',
  may_lanh: (r) => r.utilities.includes('may_lanh'),
  tu_lanh: (r) => r.utilities.includes('tu_lanh'),
  nem: (r) => r.utilities.includes('nem'),
  gio_tu_do: (r) => r.freeHours,
  de_xe: (r) => r.parking,
  thu_cung: (r) => r.petAllowed,
};

// [3] Lọc phòng phù hợp — THUẦN LOGIC, KHÔNG dùng LLM.
// Đây là "nguồn sự thật" về phòng để bước sinh câu trả lời không bịa.
@Injectable()
export class RoomMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  async match(info: ExtractedInfo, limit = 3): Promise<MatchedRoom[]> {
    const rooms = await this.prisma.room.findMany({
      // Chỉ phòng CÒN TRỐNG. Phòng đã cọc/đã thuê không bao giờ được đưa cho
      // AI tư vấn — đây là biện pháp chống rủi ro "dữ liệu phòng sai".
      where: {
        status: RoomStatus.AVAILABLE,
        ...(info.area
          ? { area: { contains: info.area, mode: 'insensitive' } }
          : {}),
        // Nới trần ngân sách 10%: khách nói "tầm 3tr5" thường vẫn xem phòng
        // 3tr8. Lọc cứng ở đây sẽ giấu mất phòng mà khách thực sự muốn xem.
        ...(info.budgetMax
          ? { price: { lte: Math.round(info.budgetMax * 1.1) } }
          : {}),
        // Loại phòng nhỏ hơn số người khách cần ở.
        ...(info.peopleCount
          ? {
              OR: [
                { peopleCountMax: null },
                { peopleCountMax: { gte: info.peopleCount } },
              ],
            }
          : {}),
      },
      take: 50,
    });

    return rooms
      .map((room) => ({ room, score: this.score(room, info) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ room, score }) => this.toMatchedRoom(room, score));
  }

  /**
   * Chấm điểm khớp trong khoảng 0..1.
   * Ưu tiên: đúng khu vực > trong ngân sách > đủ tiện ích > vừa số người.
   */
  private score(room: Room, info: ExtractedInfo): number {
    let s = 0.3; // điểm nền

    if (info.area && this.areaMatches(room.area, info.area)) s += 0.3;

    if (info.budgetMax) {
      if (room.price <= info.budgetMax) {
        // Càng sát trần ngân sách càng hợp ý (khách thường muốn phòng tốt
        // nhất trong tầm tiền), nhưng không được vượt trần.
        s += 0.15 + 0.1 * (room.price / info.budgetMax);
      } else {
        // Vượt trần nhưng còn trong biên 10% — vẫn đáng gợi ý, điểm thấp hơn.
        s += 0.05;
      }
    }

    if (info.requirements?.length) {
      const hit = info.requirements.filter((req) =>
        this.satisfies(room, req),
      ).length;
      s += 0.15 * (hit / info.requirements.length);
    }

    if (info.peopleCount && room.peopleCountMax) {
      if (info.peopleCount <= room.peopleCountMax) s += 0.05;
    }

    return Math.min(1, Number(s.toFixed(3)));
  }

  private satisfies(room: Room, requirement: string): boolean {
    return REQUIREMENT_PREDICATES[requirement]?.(room) ?? false;
  }

  /**
   * So khu vực sau khi bỏ dấu, đối chiếu hai chiều — khách gõ "go vap" hay
   * "Gò Vấp" hay "quận Gò Vấp" đều phải khớp phòng ghi "Gò Vấp".
   */
  private areaMatches(roomArea: string, needle: string): boolean {
    const a = deaccent(roomArea);
    const b = deaccent(needle);
    return a.includes(b) || b.includes(a);
  }

  private toMatchedRoom(room: Room, score: number): MatchedRoom {
    return {
      id: room.id,
      roomCode: room.roomCode,
      area: room.area,
      address: room.address ?? undefined,
      price: room.price,
      roomType: room.roomType ?? undefined,
      highlights: this.highlights(room),
      furniture: room.furniture ?? undefined,
      note: room.note ?? undefined,
      imageLinks: room.imageLinks,
      videoLinks: room.videoLinks,
      matchScore: score,
    };
  }

  private highlights(room: Room): string[] {
    const h: string[] = [];
    if (room.roomType) h.push(room.roomType);
    if (room.wc === 'rieng') h.push('WC riêng');
    if (room.utilities.includes('may_lanh')) h.push('máy lạnh');
    if (room.utilities.includes('tu_lanh')) h.push('tủ lạnh');
    if (room.size) h.push(`${room.size}m2`);
    if (room.freeHours) h.push('giờ giấc tự do');
    if (room.parking) h.push('có chỗ để xe');
    if (room.petAllowed) h.push('nuôi thú cưng được');
    return h;
  }
}
