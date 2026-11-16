import { Controller, Get } from '@nestjs/common';
import { APPROVERS, REASONS, todayISO } from './common';
import { EmployeesService } from './employees.service';

@Controller()
export class AppController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('config')
  async config() {
    return {
      sections: await this.employees.sections(),
      reasons: REASONS,
      approvers: APPROVERS.map((a) => a.name),
      staffPinRequired: !!(process.env.STAFF_PIN || ''),
      employees: await this.employees.list(),
      today: todayISO(),
    };
  }
}
