import { Body, Controller, Post, Req } from '@nestjs/common';
import { UserRole } from '@cba/shared';
import { SheetsService } from './sheets.service';
import { Roles } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('sheets')
export class SheetsController {
  constructor(private readonly sheets: SheetsService) {}

  // Đồng bộ phòng từ Google Sheet. Rủi ro cao như import Excel -> chỉ admin.
  @Roles(UserRole.ADMIN)
  @Post('sync')
  sync(
    @Body() body: { spreadsheetId: string; range?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sheets.sync(
      body.spreadsheetId,
      body.range || 'A1:Z10000',
      req.user.userId,
    );
  }
}
