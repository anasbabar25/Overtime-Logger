import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { APPROVERS, POWER_USER, SESSION_DAYS, sleep } from './common';
import { Approver, Session } from './entities';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Approver) private readonly approvers: Repository<Approver>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
  ) {}

  names() {
    return APPROVERS.map((a) => a.name);
  }

  account(name: string) {
    if (name === POWER_USER.name) return { name: POWER_USER.name, role: 'power' as const };
    if (this.names().includes(name)) return { name, role: 'approver' as const };
    return null;
  }

  checkName(name: string) {
    if (!this.account(name)) throw new BadRequestException('Unknown account.');
  }

  private hash(salt: string, pw: string) {
    return createHash('sha256').update(`${salt}|${pw}`, 'utf8').digest('base64');
  }

  private verify(approver: Approver, pw: string) {
    if (!approver?.passwordHash || !approver.salt) return false;
    return this.hash(approver.salt, String(pw)) === approver.passwordHash;
  }

  private async setPassword(name: string, pw: string) {
    if (String(pw).length < 6) throw new BadRequestException('Password must be at least 6 characters.');
    const acc = this.account(name);
    if (!acc) throw new BadRequestException('Unknown account.');
    const salt = randomUUID();
    const passwordHash = this.hash(salt, String(pw));
    const existing = await this.approvers.findOne({ where: { name } });
    if (existing) {
      await this.approvers.update({ name }, { salt, passwordHash, role: acc.role });
    } else {
      await this.approvers.save({
        name,
        email: acc.role === 'power' ? POWER_USER.email : '',
        salt,
        passwordHash,
        role: acc.role,
      });
    }
    await this.sessions.delete({ approverName: name });
  }

  private async newSession(name: string) {
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const expiresAt = String(Date.now() + SESSION_DAYS * 864e5);
    await this.sessions.save({ token, approverName: name, expiresAt });
    return token;
  }

  async sessionAccount(token: string, quiet = false) {
    if (token) {
      const row = await this.sessions.findOne({ where: { token } });
      if (row) {
        const acc = this.account(row.approverName);
        if (Date.now() < Number(row.expiresAt) && acc) return acc;
        await this.sessions.delete({ token });
      }
    }
    if (quiet) return null;
    throw new UnauthorizedException('Login has expired. Log in again.');
  }

  async session(token: string, quiet = false) {
    const acc = await this.sessionAccount(token, true);
    if (acc) return acc.name;
    if (quiet) return null;
    throw new UnauthorizedException('Approver login has expired. Log in again.');
  }

  async requireRole(token: string, role: 'approver' | 'power') {
    const acc = await this.sessionAccount(token);
    if (acc.role !== role) throw new UnauthorizedException(role === 'power' ? 'Power user login is required.' : 'Approver login is required.');
    return acc.name;
  }

  async status() {
    const rows = await this.approvers.find();
    const has = new Map(rows.map((r) => [r.name, !!r.passwordHash]));
    return this.names().map((name) => ({ name, hasPassword: !!has.get(name) }));
  }

  async powerStatus() {
    const row = await this.approvers.findOne({ where: { name: POWER_USER.name } });
    return { name: POWER_USER.name, hasPassword: !!row?.passwordHash };
  }

  async login(name: string, pw: string) {
    const acc = this.account(name);
    if (!acc) throw new BadRequestException('Unknown account.');
    const approver = await this.approvers.findOne({ where: { name: acc.name } });
    if (!approver?.passwordHash) throw new BadRequestException('No password yet. Choose “Create password”.');
    if (!this.verify(approver, pw)) {
      await sleep(800);
      throw new BadRequestException('Wrong password.');
    }
    return { token: await this.newSession(acc.name), name: acc.name, role: acc.role };
  }

  async createPassword(name: string, setupCode: string, pw: string) {
    const acc = this.account(name);
    if (!acc) throw new BadRequestException('Unknown account.');
    const expected = process.env.SETUP_CODE || 'PKG-OT-2026';
    if (String(setupCode) !== String(expected)) {
      await sleep(800);
      throw new BadRequestException('Setup code is wrong.');
    }
    await this.setPassword(acc.name, pw);
    return { token: await this.newSession(acc.name), name: acc.name, role: acc.role };
  }

  async changePassword(token: string, oldPw: string, newPw: string) {
    const acc = await this.sessionAccount(token);
    const approver = await this.approvers.findOne({ where: { name: acc.name } });
    if (!this.verify(approver, oldPw)) {
      await sleep(800);
      throw new BadRequestException('Current password is wrong.');
    }
    await this.setPassword(acc.name, newPw);
    return { token: await this.newSession(acc.name), name: acc.name, role: acc.role };
  }

  async logout(token: string) {
    if (token) await this.sessions.delete({ token });
    return { ok: true };
  }
}
