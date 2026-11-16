import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { REASONS, num } from './common';
import { RequestDto, RequestsService } from './requests.service';

@Injectable()
export class ReportsService {
  constructor(private readonly requests: RequestsService) {}

  async workbook(from: string, to: string, section: string, label: string) {
    const reqs = await this.requests.forReport(from, to, section || undefined);
    const buffer = await this.build(reqs, section, label);
    const filename = `OT Report ${label}${section ? ' ' + section : ''}.xlsx`;
    return { buffer, filename };
  }

  private async build(reqs: RequestDto[], section: string, label: string) {
    const lines: any[][] = [];
    reqs.forEach((q) =>
      q.employees.forEach((e) =>
        lines.push([
          q.otDate,
          q.section,
          e.empId,
          e.name,
          e.reason,
          e.est,
          e.actual === null ? '' : e.actual,
          e.actual === null ? '' : e.actual - e.est,
          q.status,
          q.approver,
          q.initiatorName && q.initiatorEmpNo ? `${q.initiatorName}-${q.initiatorEmpNo}` : q.initiatorName || '',
          q.decidedBy,
          q.comments,
          q.remark,
        ]),
      ),
    );
    lines.sort((a, b) => (a[0] + a[1] + a[2]).localeCompare(b[0] + b[1] + b[2]));
    lines.forEach((line) => {
      line[0] = String(line[0]).split('-').reverse().join('.');
    });

    const agg = (keyFn: (q: RequestDto, e: RequestDto['employees'][number]) => string, order?: string[]) => {
      const m: Record<string, any[]> = {};
      reqs.forEach((q) =>
        q.employees.forEach((e) => {
          const k = keyFn(q, e) || '-';
          const g = m[k] || (m[k] = [k, 0, 0, 0, 0, 0, 0]);
          if (q.status === 'approved') {
            g[1]++;
            g[2] += num(e.est);
            if (e.actual !== null) {
              g[3] += num(e.actual);
              g[4] += num(e.actual) - num(e.est);
            }
          } else if (q.status === 'rejected') g[5] += num(e.est);
          else g[6] += num(e.est);
        }),
      );
      return Object.keys(m)
        .sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b)))
        .map((k) => m[k]);
    };

    const cnt = (s: string) => reqs.filter((q) => q.status === s).length;
    const appr = lines.filter((l) => l[8] === 'approved');
    const sum = (arr: any[][], i: number) => arr.reduce((a, l) => a + (l[i] === '' ? 0 : num(l[i])), 0);
    const blank = ['', '', '', '', '', '', ''];
    const H = (g: string) => [g, 'Employees (approved)', 'Approved hrs', 'Actual hrs', 'Delta', 'Rejected hrs', 'Pending hrs'];
    const summary = [
      ['OVERTIME (OT) REPORT', '', '', '', '', '', ''],
      ['Period: ' + label + (section ? ' · ' + section : ''), '', '', '', '', '', ''],
      blank,
      ['Requests approved', cnt('approved'), '', '', '', '', ''],
      ['Requests rejected', cnt('rejected'), '', '', '', '', ''],
      ['Requests pending', cnt('pending'), '', '', '', '', ''],
      ['Approved OT hours', sum(appr, 5), '', '', '', '', ''],
      ['Actual OT hours', sum(appr, 6), '', '', '', '', ''],
      ['Delta (Actual - Approved)', sum(appr, 7), '', '', '', '', ''],
      blank,
      H('Section'),
    ]
      .concat(agg((q) => q.section))
      .concat([blank, H('Reason')])
      .concat(agg((_q, e) => e.reason, REASONS))
      .concat([blank, H('Decided by')])
      .concat(agg((q) => q.decidedBy));

    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet('Summary');
    summary.forEach((row) => s1.addRow(row));
    s1.getCell('A1').font = { bold: true, size: 14 };
    s1.columns.forEach((col) => {
      col.width = 24;
    });

    const s2 = wb.addWorksheet('Detail');
    const dh = [
      'Date',
      'Section',
      'Emp No',
      'Employee Name',
      'Reason',
      'Estimated OT Hours',
      'Actual OT Hours',
      'Delta (Actual - Planned)',
      'Status',
      'Approver',
      'Initiator',
      'Decided By',
      'Comments',
      'Approver Remark',
    ];
    const header = s2.addRow(dh);
    header.font = { bold: true };
    lines.forEach((line) => {
      const added = s2.addRow(line);
      added.getCell(3).numFmt = '@';
    });
    s2.views = [{ state: 'frozen', ySplit: 1 }];
    s2.columns.forEach((col, i) => {
      col.width = i === 11 || i === 12 ? 36 : 20;
    });

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out);
  }
}
