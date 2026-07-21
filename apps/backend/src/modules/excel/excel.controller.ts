import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@cba/shared';
import { ExcelService } from './excel.service';
import { Roles } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('excel')
export class ExcelController {
  constructor(private readonly excel: ExcelService) {}

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
