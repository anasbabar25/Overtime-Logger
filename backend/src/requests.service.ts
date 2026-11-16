import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { APPROVERS, REASONS, nowStamp, num, requestId } from './common';
import { EmployeesService } from './employees.service';
import { OtRequest, RequestLine } from './entities';

export type RequestDto = {
  id: string;
  submittedAt: string;
  otDate: string;
  section: string;
  comments: string;
  approver: string;
  initiatorEmpNo: string;
  initiatorName: string;
  status: string;
  decidedBy: string;
  remark: string;
  decidedAt: string;
  employees: { empId: string; name: string; reason: string; est: number; actual: number | null }[];
};

@Injectable()
export class RequestsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OtRequest) private readonly requests: Repository<OtRequest>,
    private readonly employees: EmployeesService,
    private readonly auth: AuthService,
  ) {}

  toDto(row: OtRequest): RequestDto {
    const lines = [...(row.lines || [])].sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      id: row.id,
      submittedAt: row.submittedAt,
      otDate: row.otDate,
      section: row.section,
      comments: row.comments || '',
      approver: row.approver,
      initiatorEmpNo: row.initiatorEmpNo || '',
      initiatorName: row.initiatorName || '',
      status: row.status || 'pending',
      decidedBy: row.decidedBy || '',
      remark: row.remark || '',
      decidedAt: row.decidedAt || '',
      employees: lines.map((line) => ({
        empId: line.empNo,
        name: line.employeeName,
        reason: line.reason,
        est: num(line.estHrs),
        actual: line.actualHrs == null ? null : num(line.actualHrs),
      })),
    };
  }

  private async withLines(where: { from?: string; to?: string; section?: string; includeOpen?: boolean }) {
    const rows = await this.requests.find({
      relations: ['lines'],
      order: { submittedAt: 'ASC' },
    });
    return rows
      .filter((row) => {
        const inRange = (!where.from || row.otDate >= where.from) && (!where.to || row.otDate <= where.to);
        const open = where.includeOpen && (row.status || 'pending') === 'pending';
        const sectionOk = !where.section || row.section === where.section;
        return sectionOk && (inRange || open);
      })
      .map((row) => this.toDto(row));
  }

  getRequests(from: string, to: string) {
    return this.withLines({ from, to, includeOpen: true });
  }

  forReport(from: string, to: string, section?: string) {
    return this.withLines({ from, to, section: section || undefined });
  }

  private async staff(pin?: string, token?: string) {
    const required = process.env.STAFF_PIN || '';
    if (!required) return;
    if (token && (await this.auth.session(token, true))) return;
    if (String(pin || '') !== String(required)) throw new BadRequestException('Supervisor PIN is wrong.');
  }

  async submit(body: any, pin?: string) {
    await this.staff(pin);
    const otDate = String(body?.otDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(otDate)) throw new BadRequestException('Pick the date of OT.');
    if (!APPROVERS.some((a) => a.name === body?.approver)) throw new BadRequestException('Pick an approver.');
    const known = await this.employees.byNumber();
    const initiator = known.get(String(body?.initiatorEmpNo || ''));
    if (!initiator) throw new BadRequestException('Pick the initiator name.');
    const incoming = Array.isArray(body?.employees) ? body.employees : [];
    if (!incoming.length) throw new BadRequestException('Add at least one employee.');

    const seen: Record<string, number> = {};
    const employees = incoming.map((entry, i) => {
      const record = known.get(String(entry?.empId || ''));
      if (!record) throw new BadRequestException(`Employee ${i + 1}: pick a name from the list.`);
      if (seen[record.empNo]) throw new BadRequestException(`${record.name} is listed twice.`);
      seen[record.empNo] = 1;
      const est = num(entry?.est);
      if (!(est > 0 && est <= 16)) throw new BadRequestException(`Employee ${i + 1}: hours must be 0.5 to 16.`);
      if (!REASONS.includes(entry?.reason)) throw new BadRequestException(`Employee ${i + 1}: choose a reason.`);
      return { empId: record.empNo, name: record.name, reason: entry.reason, est, section: record.section };
    });
    const section = employees[0]?.section || '';

    const id = await this.dataSource.transaction(async (mgr) => {
      let next = requestId();
      while (await mgr.findOne(OtRequest, { where: { id: next } })) next = requestId();
      const req = mgr.create(OtRequest, {
        id: next,
        submittedAt: nowStamp(),
        otDate,
        section,
        comments: String(body?.comments || '').trim(),
        approver: String(body.approver).trim(),
        initiatorEmpNo: initiator.empNo,
        initiatorName: initiator.name,
        status: 'pending',
        decidedBy: '',
        remark: '',
        decidedAt: '',
        lines: employees.map((e, i) =>
          mgr.create(RequestLine, {
            requestId: next,
            sortOrder: i,
            empNo: e.empId,
            employeeName: e.name,
            reason: e.reason,
            estHrs: e.est,
            actualHrs: null,
            delta: null,
          }),
        ),
      });
      await mgr.save(req);
      return next;
    });

    return { id };
  }

  async decide(token: string, ids: string[] | string, status: string, remark?: string) {
    const who = await this.auth.session(token);
    if (!['approved', 'rejected', 'pending'].includes(status)) throw new BadRequestException('Unknown status.');
    const list = [].concat(ids).filter(Boolean);
    const at = status === 'pending' ? '' : nowStamp();
    const count = await this.dataSource.transaction(async (mgr) => {
      let n = 0;
      for (const id of list) {
        const row = await mgr.findOne(OtRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!row) continue;
        row.status = status;
        row.decidedBy = status === 'pending' ? '' : who;
        row.remark = status === 'pending' ? '' : remark || '';
        row.decidedAt = at;
        await mgr.save(row);
        n++;
      }
      return n;
    });
    if (!count) throw new BadRequestException('Request not found. It may have been withdrawn.');
    return { count };
  }

  async withdraw(id: string, pin?: string, token?: string) {
    await this.staff(pin, token);
    await this.dataSource.transaction(async (mgr) => {
      const row = await mgr.findOne(OtRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new BadRequestException('Request not found.');
      if ((row.status || 'pending') !== 'pending') throw new BadRequestException('Only pending requests can be withdrawn.');
      await mgr.delete(RequestLine, { requestId: id });
      await mgr.delete(OtRequest, { id });
    });
    return { ok: true };
  }

  async saveActuals(id: string, actuals: unknown[], pin?: string, token?: string) {
    await this.staff(pin, token);
    if (!Array.isArray(actuals)) throw new BadRequestException('Actual hours are missing.');
    await this.dataSource.transaction(async (mgr) => {
      const row = await mgr.findOne(OtRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new BadRequestException('Request not found.');
      const lines = await mgr.find(RequestLine, { where: { requestId: id }, order: { sortOrder: 'ASC' } });
      for (let i = 0; i < lines.length; i++) {
        const value = actuals[i];
        if (value === null || value === '' || value === undefined) {
          lines[i].actualHrs = null;
          lines[i].delta = null;
        } else {
          const actual = num(value);
          lines[i].actualHrs = actual;
          lines[i].delta = actual - num(lines[i].estHrs);
        }
      }
      await mgr.save(lines);
    });
    return { ok: true };
  }
}
