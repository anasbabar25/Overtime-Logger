import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { bearer } from './common';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('status')
  status() {
    return this.auth.status();
  }

  @Get('power-status')
  powerStatus() {
    return this.auth.powerStatus();
  }

  @Post('login')
  login(@Body() body: { name?: string; password?: string }) {
    return this.auth.login(body?.name, body?.password);
  }

  @Post('password')
  create(@Body() body: { name?: string; setupCode?: string; password?: string }) {
    return this.auth.createPassword(body?.name, body?.setupCode, body?.password);
  }

  @Post('change')
  @UseGuards(AuthGuard)
  change(@Headers('authorization') header: string, @Body() body: { oldPassword?: string; newPassword?: string }) {
    return this.auth.changePassword(bearer(header), body?.oldPassword, body?.newPassword);
  }

  @Post('logout')
  logout(@Headers('authorization') header: string) {
    return this.auth.logout(bearer(header));
  }

  @Get('me')
  async me(@Headers('authorization') header: string) {
    const acc = await this.auth.sessionAccount(bearer(header), true);
    return acc ? { name: acc.name, role: acc.role } : { name: null, role: null };
  }
}
