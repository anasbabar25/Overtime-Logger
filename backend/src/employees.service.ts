import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { Employee } from './entities';

@Injectable()
export class EmployeesService {
  constructor(@InjectRepository(Employee) private readonly repo: Repository<Employee>) {}

  list() {
    return this.repo.find({ order: { seq: 'ASC' } }).then((rows) => rows.map((e) => [e.empNo, e.name, e.section]));
  }

  async sections() {
    const rows = await this.repo
      .createQueryBuilder('e')
      .select('e.section', 'section')
      .distinct(true)
      .where("e.section <> ''")
      .orderBy('e.section', 'ASC')
      .getRawMany();
    return rows.map((r) => String(r.section));
  }

  async byNumber() {
    const rows = await this.repo.find();
    const map = new Map<string, Employee>();
    rows.forEach((e) => map.set(e.empNo, e));
    return map;
  }

  async replaceAll(rows: [string, string, string][]) {
    await this.repo.clear();
    const records = rows.map((e, seq) => ({ empNo: e[0], name: e[1], section: e[2], seq }));
    for (let i = 0; i < records.length; i += 100) await this.repo.insert(records.slice(i, i + 100));
    return records.length;
  }

  async importWorkbook(buffer: Buffer) {
    const rows = await this.parseWorkbook(buffer);
    if (!rows.length) throw new BadRequestException('No employees found. Use columns EMPLOY, NAME, SECTION.');
    const count = await this.replaceAll(rows);
    return { count };
  }

  async parseWorkbook(buffer: Buffer): Promise<[string, string, string][]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('The Excel file has no sheet.');

    let headers: Record<string, number> = {};
    const out: [string, string, string][] = [];
    const seen = new Set<string>();

    sheet.eachRow((row, idx) => {
      const values = (row.values as any[]).map((v) => this.cellText(v));
      if (idx === 1 || (!headers.emp && this.isHeaderRow(values))) {
        headers = this.headerMap(values);
        return;
      }
      if (!headers.emp) return;
      const emp = this.empNo(values[headers.emp]);
      const name = String(values[headers.name] || '').replace(/\s+/g, ' ').trim();
      const section = String(values[headers.section] || '').replace(/\s+/g, ' ').trim();
      if (!emp || !name) return;
      if (seen.has(emp)) return;
      seen.add(emp);
      out.push([emp, name, section]);
    });

    return out;
  }

  private isHeaderRow(values: string[]) {
    const joined = values.map((v) => v.toLowerCase()).join(' ');
    return /employ|emp\s*no|name/.test(joined);
  }

  private headerMap(values: string[]) {
    const map: Record<string, number> = {};
    values.forEach((raw, i) => {
      const v = String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (!v) return;
      if (['employ', 'empno', 'empnumber', 'employeenumber', 'employeeno', 'id'].includes(v) && map.emp == null) map.emp = i;
      else if (['name', 'employeename', 'fullname'].includes(v) && map.name == null) map.name = i;
      else if (['section', 'department', 'dept'].includes(v) && map.section == null) map.section = i;
    });
    if (map.emp == null || map.name == null) {
      throw new BadRequestException('The first row must have EMPLOY, NAME, and SECTION columns.');
    }
    if (map.section == null) map.section = map.name + 1;
    return map;
  }

  private empNo(value: string) {
    let v = String(value || '').trim();
    if (/^\d+\.0$/.test(v)) v = v.slice(0, -2);
    return v;
  }

  private cellText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'object' && value && 'text' in (value as any)) return String((value as any).text ?? '');
    if (typeof value === 'object' && value && 'result' in (value as any)) return String((value as any).result ?? '');
    if (typeof value === 'object' && value && 'richText' in (value as any)) {
      return ((value as any).richText || []).map((p: any) => p.text || '').join('');
    }
    return String(value);
  }
}
