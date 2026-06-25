import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';

function makeConfig(): ConfigService {
  return {
    getOrThrow: <T>(key: string) => {
      const values: Record<string, number> = {
        LOGIN_LOCKOUT_MINUTES: 15,
        LOGIN_RATE_LIMIT_USER_MAX: 5,
      };
      return values[key] as unknown as T;
    },
  } as ConfigService;
}

function makeEmailCrypto() {
  return { hash: (email: string) => `hash:${email.toLowerCase()}` };
}

function makeUserService(user: { id: string; passwordHash: string; isActive: boolean } | null) {
  return { findByEmail: jest.fn(async () => user) };
}

function makeSessions(token: string) {
  return { create: jest.fn(async () => token), destroy: jest.fn() };
}

function makePrisma(failedAttempts: number) {
  return {
    loginAttempt: {
      count: jest.fn(async () => failedAttempts),
      create: jest.fn(),
    },
  };
}

describe('AuthService', () => {
  it('blocks login with 403 when the user has exceeded the lockout threshold', async () => {
    const prisma = makePrisma(5);
    const auth = new AuthService(
      prisma as never,
      makeEmailCrypto() as never,
      makeSessions('tok') as never,
      makeUserService(null) as never,
      makeConfig(),
    );
    await expect(auth.login('a@b.com', 'pw-12345678', '127.0.0.1', 'jest')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns 401 for an unknown user without leaking that the user does not exist', async () => {
    const prisma = makePrisma(0);
    const auth = new AuthService(
      prisma as never,
      makeEmailCrypto() as never,
      makeSessions('tok') as never,
      makeUserService(null) as never,
      makeConfig(),
    );
    await expect(auth.login('ghost@x.com', 'pw-12345678', '127.0.0.1', 'jest')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ success: false, userId: null }),
    });
  });

  it('returns 401 when the password does not verify', async () => {
    const passwordHash = await argon2.hash('correct-password', { type: argon2.argon2id });
    const prisma = makePrisma(0);
    const auth = new AuthService(
      prisma as never,
      makeEmailCrypto() as never,
      makeSessions('tok') as never,
      makeUserService({ id: 'u', passwordHash, isActive: true }) as never,
      makeConfig(),
    );
    await expect(auth.login('a@b.com', 'wrong-password', '127.0.0.1', 'jest')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('issues a session token on valid credentials', async () => {
    const passwordHash = await argon2.hash('correct-password', { type: argon2.argon2id });
    const prisma = makePrisma(0);
    const sessions = makeSessions('issued-token');
    const auth = new AuthService(
      prisma as never,
      makeEmailCrypto() as never,
      sessions as never,
      makeUserService({ id: 'u', passwordHash, isActive: true }) as never,
      makeConfig(),
    );
    const result = await auth.login('a@b.com', 'correct-password', '127.0.0.1', 'jest');
    expect(result).toEqual({ token: 'issued-token', userId: 'u' });
    expect(sessions.create).toHaveBeenCalledWith('u', '127.0.0.1', 'jest');
  });
});
