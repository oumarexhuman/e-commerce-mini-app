import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { EmailCryptoService } from '../crypto/email-crypto.service';
import { SessionService } from '../sessions/session.service';
import { UserService } from '../users/user.service';

const PHANTOM_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$' +
  'YWFhYWFhYWFhYWFhYWFhYQ$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class AuthService {
  private readonly lockoutMs: number;
  private readonly lockoutThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailCryptoService,
    private readonly sessions: SessionService,
    private readonly users: UserService,
    config: ConfigService,
  ) {
    this.lockoutMs = config.getOrThrow<number>('LOGIN_LOCKOUT_MINUTES') * 60_000;
    this.lockoutThreshold = config.getOrThrow<number>('LOGIN_RATE_LIMIT_USER_MAX');
  }

  async login(
    email: string,
    password: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ token: string; userId: string }> {
    const emailHash = this.email.hash(email);
    const since = new Date(Date.now() - this.lockoutMs);

    const recentFailures = await this.prisma.loginAttempt.count({
      where: { emailHash, success: false, createdAt: { gte: since } },
    });
    if (recentFailures >= this.lockoutThreshold) {
      throw new ForbiddenException('Too many failed attempts. Try again later.');
    }

    const user = await this.users.findByEmail(email);
    const passwordHash = user?.passwordHash ?? PHANTOM_HASH;
    const passwordOk = await argon2.verify(passwordHash, password).catch(() => false);

    const success = Boolean(user && user.isActive && passwordOk);

    await this.prisma.loginAttempt.create({
      data: {
        userId: success ? user!.id : null,
        emailHash,
        ipAddress,
        success,
      },
    });

    if (!success) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.sessions.create(user!.id, ipAddress, userAgent);
    return { token, userId: user!.id };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) {
      await this.sessions.destroy(token);
    }
  }
}
