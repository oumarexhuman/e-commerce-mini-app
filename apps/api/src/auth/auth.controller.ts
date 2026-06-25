import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../users/user.service';
import { CsrfService } from './csrf.service';

@Controller('auth')
export class AuthController {
  private readonly cookieName: string;
  private readonly cookieDomain: string;
  private readonly cookieSecure: boolean;
  private readonly maxAgeMs: number;

  constructor(
    private readonly auth: AuthService,
    private readonly csrf: CsrfService,
    config: ConfigService,
  ) {
    this.cookieName = config.getOrThrow<string>('SESSION_COOKIE_NAME');
    this.cookieDomain = config.getOrThrow<string>('SESSION_COOKIE_DOMAIN');
    this.cookieSecure = config.getOrThrow<boolean>('SESSION_COOKIE_SECURE');
    this.maxAgeMs = config.getOrThrow<number>('SESSION_MAX_AGE_DAYS') * 24 * 60 * 60_000;
  }

  @Public()
  @Get('csrf')
  csrfToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.csrf.generate(req, res);
    return { csrfToken: token };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (dto.honeypot && dto.honeypot.length > 0) {
      throw new BadRequestException('Invalid request');
    }

    const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').toString();
    const userAgent = (req.headers['user-agent'] ?? 'unknown').toString().slice(0, 512);

    const { token } = await this.auth.login(dto.email, dto.password, ip, userAgent);

    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      ...(this.cookieDomain && this.cookieDomain !== 'localhost' ? { domain: this.cookieDomain } : {}),
      maxAge: this.maxAgeMs,
      path: '/',
    });

    return { ok: true };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[this.cookieName];
    await this.auth.logout(typeof token === 'string' ? token : undefined);
    res.clearCookie(this.cookieName, {
      path: '/',
      ...(this.cookieDomain && this.cookieDomain !== 'localhost' ? { domain: this.cookieDomain } : {}),
    });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
