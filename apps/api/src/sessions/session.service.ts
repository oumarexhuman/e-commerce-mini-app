import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const TOKEN_BYTES = 32;

@Injectable()
export class SessionService {
  private readonly inactivityMs: number;
  private readonly absoluteMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.inactivityMs = config.getOrThrow<number>('SESSION_INACTIVITY_MINUTES') * 60_000;
    this.absoluteMs = config.getOrThrow<number>('SESSION_MAX_AGE_DAYS') * 24 * 60 * 60_000;
  }

  generateToken(): string {
    return randomBytes(TOKEN_BYTES).toString('hex');
  }

  async create(userId: string, ipAddress: string, userAgent: string): Promise<string> {
    const token = this.generateToken();
    const now = new Date();
    await this.prisma.session.create({
      data: {
        id: token,
        userId,
        ipAddress,
        userAgent,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + this.absoluteMs),
      },
    });
    return token;
  }

  async validateAndTouch(token: string): Promise<{ userId: string } | null> {
    const session = await this.prisma.session.findUnique({ where: { id: token } });
    if (!session) return null;

    const now = new Date();

    if (session.expiresAt <= now) {
      await this.destroy(token);
      return null;
    }

    const idleMs = now.getTime() - session.lastActivityAt.getTime();
    if (idleMs > this.inactivityMs) {
      await this.destroy(token);
      return null;
    }

    await this.prisma.session.update({
      where: { id: token },
      data: { lastActivityAt: now },
    });

    return { userId: session.userId };
  }

  async destroy(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: token } });
  }

  async destroyAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
