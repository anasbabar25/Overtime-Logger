import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { bearer } from './common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.approverName = await this.auth.session(bearer(req.headers.authorization));
    return true;
  }
}

@Injectable()
export class ApproverGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.approverName = await this.auth.requireRole(bearer(req.headers.authorization), 'approver');
    return true;
  }
}

@Injectable()
export class PowerGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.approverName = await this.auth.requireRole(bearer(req.headers.authorization), 'power');
    return true;
  }
}
