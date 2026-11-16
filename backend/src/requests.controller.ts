import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApproverGuard } from './auth.guard';
import { bearer } from './common';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@Query('from') from: string, @Query('to') to: string) {
    return this.requests.getRequests(from || '0000-01-01', to || '9999-12-31');
  }

  @Post()
  submit(@Body() body: any) {
    return this.requests.submit(body, body?.pin);
  }

  @Post('decide')
  @UseGuards(ApproverGuard)
  decide(@Headers('authorization') header: string, @Body() body: { ids?: string[] | string; status?: string; remark?: string }) {
    return this.requests.decide(bearer(header), body?.ids, body?.status, body?.remark);
  }

  @Post(':id/withdraw')
  withdraw(@Param('id') id: string, @Headers('authorization') header: string, @Body() body: { pin?: string }) {
    return this.requests.withdraw(id, body?.pin, bearer(header));
  }

  @Post(':id/actuals')
  actuals(
    @Param('id') id: string,
    @Headers('authorization') header: string,
    @Body() body: { actuals?: unknown[]; pin?: string },
  ) {
    return this.requests.saveActuals(id, body?.actuals, body?.pin, bearer(header));
  }
}
