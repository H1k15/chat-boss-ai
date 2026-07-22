import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '@cba/shared';
import { ExcelService } from './excel.service';
import { Roles } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('excel')
export class ExcelController {
  constructor(private readonly excel: ExcelService) {}

  // Tải file .xlsx mẫu đúng cấu trúc cột.
  @Get('template')
  template(@Res() res: Response) {
    const buf = this.excel.buildTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mau-phong.xlsx"',
    });
    res.send(buf);
  }

  // Lịch sử import.
  @Get('import-batches')
  batches(@Query('limit') limit?: string) {
    return this.excel.listBatches(limit ? parseInt(limit) : undefined);
  }

  // Chỉ admin được nhập dữ liệu phòng: import sai làm AI tư vấn sai trên toàn
  // hệ thống, nên đây là thao tác rủi ro cao nhất trong app.
  @Roles(UserRole.ADMIN)
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  import(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn file .xlsx');
    return this.excel.importBuffer(
      file.buffer,
      file.originalname,
      req.user.userId,
    );
  }
}
