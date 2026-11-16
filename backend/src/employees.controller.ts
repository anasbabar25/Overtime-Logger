import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PowerGuard } from './auth.guard';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Post('import')
  @UseGuards(PowerGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async import(@UploadedFile() file?: { buffer?: Buffer; originalname?: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose an Excel file (.xlsx).');
    if (!/\.xlsx$/i.test(file.originalname || '')) throw new BadRequestException('Upload an .xlsx Excel file.');
    return this.employees.importWorkbook(file.buffer);
  }
}
