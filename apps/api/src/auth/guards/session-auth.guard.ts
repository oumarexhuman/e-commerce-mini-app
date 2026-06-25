import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { SessionService } from '../../sessions/session.service';
import { UserService } from '../../users/user.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly cookieName: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly users: UserService,
    config: ConfigService,
  ) {
    this.cookieName = config.getOrThrow<string>('SESSION_COOKIE_NAME');
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = req.cookies?.[this.cookieName];
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const valid = await this.sessions.validateAndTouch(token);
    if (!valid) {
      throw new UnauthorizedException('Session expired');
    }

    const user = await this.users.getAuthenticatedUser(valid.userId);
    if (!user) {
      await this.sessions.destroy(token);
      throw new UnauthorizedException('Account no longer accessible');
    }

    req.user = user;
    return true;
  }
}
