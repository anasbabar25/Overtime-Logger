import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { APPROVERS, POWER_USER } from './common';
import { Approver, Employee } from './entities';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(Approver) private readonly approvers: Repository<Approver>,
  ) {}

  async onModuleInit() {
    for (const approver of APPROVERS) {
      const existing = await this.approvers.findOne({ where: { name: approver.name } });
      if (!existing) {
        await this.approvers.save({ name: approver.name, email: approver.email, salt: null, passwordHash: null, role: 'approver' });
      } else if (existing.role !== 'approver') {
        await this.approvers.update({ name: approver.name }, { role: 'approver' });
      }
    }
    const power = await this.approvers.findOne({ where: { name: POWER_USER.name } });
    if (!power) {
      await this.approvers.save({ name: POWER_USER.name, email: POWER_USER.email, salt: null, passwordHash: null, role: 'power' });
    } else if (power.role !== 'power') {
      await this.approvers.update({ name: POWER_USER.name }, { role: 'power' });
    }

    const rows = this.loadEmployees().map((e, seq) => ({
      empNo: e[0],
      name: e[1],
      section: e[2],
      seq,
    }));
    const count = await this.employees.count();
    if (count > 0 && count !== 535) return;
    if (count > 0) await this.employees.clear();
    for (let i = 0; i < rows.length; i += 100) await this.employees.insert(rows.slice(i, i + 100));
    this.logger.log(`${count ? 'Replaced' : 'Seeded'} ${rows.length} employees`);
  }

  private loadEmployees(): [string, string, string][] {
    const paths = [
      join(__dirname, 'seed', 'employees.json'),
      join(__dirname, 'employees.json'),
      join(process.cwd(), 'src', 'seed', 'employees.json'),
    ];
    for (const path of paths) {
      try {
        return JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        /* try the next location */
      }
    }
    throw new Error('employees.json was not found');
  }
}
