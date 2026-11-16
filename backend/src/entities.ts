import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

const decimal = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null || v === '' ? null : parseFloat(v)),
};

@Entity('employees')
export class Employee {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  empNo: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 64 })
  section: string;

  @Column({ type: 'int' })
  seq: number;
}

@Entity('approvers')
export class Approver {
  @PrimaryColumn({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 180, default: '' })
  email: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  salt: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 16, default: 'approver' })
  role: string;
}

@Entity('sessions')
export class Session {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  token: string;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  approverName: string;

  @Column({ type: 'varchar', length: 20 })
  expiresAt: string;
}

@Entity('ot_requests')
export class OtRequest {
  @PrimaryColumn({ type: 'varchar', length: 24 })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  submittedAt: string;

  @Index()
  @Column({ type: 'varchar', length: 10 })
  otDate: string;

  @Column({ type: 'varchar', length: 64 })
  section: string;

  @Column({ type: 'text' })
  comments: string;

  @Column({ type: 'varchar', length: 120 })
  approver: string;

  @Column({ type: 'varchar', length: 32, default: '' })
  initiatorEmpNo: string;

  @Column({ type: 'varchar', length: 160, default: '' })
  initiatorName: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  decidedBy: string;

  @Column({ type: 'text' })
  remark: string;

  @Column({ type: 'varchar', length: 20, default: '' })
  decidedAt: string;

  @OneToMany(() => RequestLine, (line) => line.request, { cascade: true, eager: true })
  lines: RequestLine[];
}

@Entity('ot_request_lines')
export class RequestLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'request_id', type: 'varchar', length: 24 })
  requestId: string;

  @ManyToOne(() => OtRequest, (request) => request.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: OtRequest;

  @Column({ type: 'int' })
  sortOrder: number;

  @Column({ type: 'varchar', length: 32 })
  empNo: string;

  @Column({ type: 'varchar', length: 160 })
  employeeName: string;

  @Column({ type: 'varchar', length: 64 })
  reason: string;

  @Column({ type: 'decimal', precision: 5, scale: 1, transformer: decimal })
  estHrs: number;

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true, transformer: decimal })
  actualHrs: number | null;

  @Column({ type: 'decimal', precision: 6, scale: 1, nullable: true, transformer: decimal })
  delta: number | null;
}
