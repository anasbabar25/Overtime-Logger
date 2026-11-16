import { Body, Controller, Headers, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from './auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('export')
  @UseGuards(AuthGuard)
  async export(
    @Body() body: { from?: string; to?: string; section?: string; label?: string },
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.workbook(body?.from, body?.to, body?.section || '', body?.label || '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  }
}
