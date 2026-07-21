import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { RolesGuard } from './modules/auth/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FacebookProfilesModule } from './modules/facebook-profiles/facebook-profiles.module';
import { CustomersModule } from './modules/customers/customers.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { CareTasksModule } from './modules/care-tasks/care-tasks.module';
import { AiModule } from './modules/ai/ai.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { ExcelModule } from './modules/excel/excel.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    FacebookProfilesModule,
    CustomersModule,
    RoomsModule,
    ConversationsModule,
    AppointmentsModule,
    CareTasksModule,
    AiModule,
    TelegramModule,
    ExcelModule,
    ReportsModule,
  ],
  // Guard đăng ký toàn cục: mặc định MỌI route đều phải đăng nhập, trừ route
  // gắn @Public(). Thứ tự quan trọng — xác thực (JWT) phải chạy trước phân
  // quyền (RolesGuard), vì RolesGuard đọc req.user do JwtAuthGuard gắn vào.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
