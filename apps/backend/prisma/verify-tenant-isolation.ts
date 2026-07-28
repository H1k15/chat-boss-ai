/**
 * Chứng minh CÁCH LY TENANT end-to-end trên DB thật (không phải unit test).
 * Tạo org B + phòng trong B, rồi kiểm tra org A KHÔNG đọc/sửa được dữ liệu B.
 *
 * Chạy: pnpm --filter @cba/backend verify:tenant
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { runWithTenant } from '../src/common/tenant-context';

const A = 'org_seed_default';
const B = 'org_iso_test';

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit(); // đăng ký $use middleware + connect

  let pass = true;
  const check = (cond: boolean, label: string) => {
    // eslint-disable-next-line no-console
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) pass = false;
  };

  // Org B (Organization không bị scope -> tạo được từ ngoài context).
  await prisma.organization.upsert({
    where: { id: B },
    update: {},
    create: { id: B, name: 'ISO Test Org', slug: 'iso-test' },
  });

  // Tạo phòng trong context org B. LƯU Ý: PrismaPromise lazy -> phải AWAIT bên
  // trong runWithTenant để truy vấn chạy TRONG context (giống handler Nest await).
  const roomB = await runWithTenant({ organizationId: B }, async () =>
    prisma.room.create({ data: { roomCode: 'ISO_ROOM', area: 'Z', price: 1 } }),
  );
  check(roomB.organizationId === B, 'phòng tạo trong ctx B thuộc org B');

  // Org A KHÔNG thấy phòng của B qua findMany.
  const seenByA = await runWithTenant({ organizationId: A }, async () =>
    prisma.room.findMany({ where: { roomCode: 'ISO_ROOM' } }),
  );
  check(seenByA.length === 0, 'org A không thấy phòng B (findMany)');

  // Org A đọc theo id phòng B -> null (extendedWhereUnique chặn).
  const byIdA = await runWithTenant({ organizationId: A }, async () =>
    prisma.room.findUnique({ where: { id: roomB.id } }),
  );
  check(byIdA === null, 'org A không đọc được phòng B theo id (findUnique)');

  // Org A sửa phòng B theo id -> bị chặn (không có dòng khớp -> P2025).
  let updateBlocked = false;
  try {
    await runWithTenant({ organizationId: A }, async () =>
      prisma.room.update({ where: { id: roomB.id }, data: { price: 999 } }),
    );
  } catch {
    updateBlocked = true;
  }
  check(updateBlocked, 'org A không sửa được phòng B theo id (update chặn)');

  // Org B thấy phòng của mình.
  const seenByB = await runWithTenant({ organizationId: B }, async () =>
    prisma.room.findMany({ where: { roomCode: 'ISO_ROOM' } }),
  );
  check(seenByB.length === 1, 'org B thấy phòng của mình');

  // AppSetting per-org (Đợt 3): org B đặt cấu hình -> org A KHÔNG thấy.
  await runWithTenant({ organizationId: B }, async () =>
    prisma.appSetting.upsert({
      where: { organizationId_key: { organizationId: B, key: 'iso_cfg' } },
      update: { value: { v: 'B' } },
      create: { key: 'iso_cfg', value: { v: 'B' } },
    }),
  );
  const cfgSeenByA = await runWithTenant({ organizationId: A }, async () =>
    prisma.appSetting.findMany({ where: { key: 'iso_cfg' } }),
  );
  check(cfgSeenByA.length === 0, 'org A không thấy cấu hình app_settings của org B');

  // Dọn dẹp.
  await runWithTenant({ organizationId: B }, async () => {
    await prisma.room.deleteMany({ where: { roomCode: 'ISO_ROOM' } });
    await prisma.appSetting.deleteMany({ where: { key: 'iso_cfg' } });
  });
  await prisma.organization.delete({ where: { id: B } });
  await prisma.$disconnect();

  // eslint-disable-next-line no-console
  console.log(pass ? '\n==> TẤT CẢ PASS: cách ly tenant hoạt động.' : '\n==> CÓ FAIL!');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
