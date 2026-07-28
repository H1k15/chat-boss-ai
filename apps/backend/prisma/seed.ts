import { PrismaClient, UserRole, RoomStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Multi-tenant Đợt 1: mọi dữ liệu thuộc org mặc định (Đợt 2 mới đa org).
const ORG_ID = 'org_seed_default';

async function main() {
  // Org mặc định (idempotent — migration cũng đã chèn sẵn).
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { plan: 'unlimited' },
    create: { id: ORG_ID, name: 'Nhà trọ mặc định', slug: 'default', plan: 'unlimited' },
  });

  // Super-admin (chủ SaaS) — quản lý mọi nhà trọ. Thuộc org mặc định nhưng bỏ
  // qua tenant scope nhờ vai trò SUPER_ADMIN.
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: ORG_ID, email: 'super@chatboss.ai' } },
    update: {},
    create: {
      email: 'super@chatboss.ai',
      passwordHash: await bcrypt.hash('super123', 10),
      fullName: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
    },
  });

  // Admin mặc định
  const admin = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: ORG_ID, email: 'admin@chatboss.ai' } },
    update: {},
    create: {
      email: 'admin@chatboss.ai',
      passwordHash: await bcrypt.hash('admin123', 10),
      fullName: 'Quản trị viên',
      role: UserRole.ADMIN,
    },
  });

  const sale1 = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: ORG_ID, email: 'sale1@chatboss.ai' } },
    update: {},
    create: {
      email: 'sale1@chatboss.ai',
      passwordHash: await bcrypt.hash('sale123', 10),
      fullName: 'Sale 1',
      role: UserRole.STAFF,
    },
  });

  // Nick Facebook cá nhân mẫu
  await prisma.facebookProfile.create({
    data: {
      displayName: 'Nick A',
      area: 'Gò Vấp',
      ownerId: sale1.id,
    },
  });

  // Phòng mẫu (theo ví dụ trong mô tả dự án)
  const rooms = [
    {
      roomCode: 'P001',
      area: 'Gò Vấp',
      address: 'Phan Văn Trị, Gò Vấp',
      price: 3800000,
      deposit: 3800000,
      size: 20,
      peopleCountMax: 2,
      roomType: 'gác',
      wc: 'rieng',
      utilities: ['gac'],
      freeHours: true,
      status: RoomStatus.AVAILABLE,
    },
    {
      roomCode: 'P007',
      area: 'Gò Vấp',
      address: 'Gần chợ Gò Vấp',
      price: 3600000,
      size: 18,
      peopleCountMax: 2,
      roomType: 'phòng thường',
      wc: 'rieng',
      utilities: [],
      status: RoomStatus.AVAILABLE,
    },
    {
      roomCode: 'P011',
      area: 'Gò Vấp',
      price: 4000000,
      size: 22,
      peopleCountMax: 2,
      roomType: 'phòng thường',
      wc: 'rieng',
      utilities: ['may_lanh'],
      freeHours: true,
      status: RoomStatus.AVAILABLE,
    },
  ];
  for (const r of rooms) {
    await prisma.room.upsert({
      where: { organizationId_roomCode: { organizationId: ORG_ID, roomCode: r.roomCode } },
      update: r,
      create: r,
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed xong. Đăng nhập admin@chatboss.ai / admin123');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
