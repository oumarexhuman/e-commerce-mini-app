import { ConfigService } from '@nestjs/config';
import { SessionService } from '../src/sessions/session.service';

function makePrisma() {
  return {
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as const;
}

function makeConfig(values: Record<string, number | string>): ConfigService {
  return {
    getOrThrow: <T>(key: string) => values[key] as unknown as T,
  } as ConfigService;
}

describe('SessionService', () => {
  const baseConfig = makeConfig({ SESSION_INACTIVITY_MINUTES: 30, SESSION_MAX_AGE_DAYS: 30 });

  it('creates a session with a hex token and stores it', async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma as never, baseConfig);
    const token = await svc.create('user-1', '127.0.0.1', 'jest');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
    const args = prisma.session.create.mock.calls[0][0];
    expect(args.data.id).toBe(token);
    expect(args.data.userId).toBe('user-1');
  });

  it('returns null and destroys an expired session', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      id: 'tok',
      userId: 'u',
      expiresAt: new Date(Date.now() - 1000),
      lastActivityAt: new Date(),
    });
    const svc = new SessionService(prisma as never, baseConfig);
    const result = await svc.validateAndTouch('tok');
    expect(result).toBeNull();
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { id: 'tok' } });
  });

  it('returns null when idle longer than the inactivity window', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      id: 'tok',
      userId: 'u',
      expiresAt: new Date(Date.now() + 60_000 * 60),
      lastActivityAt: new Date(Date.now() - 60_000 * 31),
    });
    const svc = new SessionService(prisma as never, baseConfig);
    expect(await svc.validateAndTouch('tok')).toBeNull();
    expect(prisma.session.deleteMany).toHaveBeenCalled();
  });

  it('updates lastActivityAt for a fresh session', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      id: 'tok',
      userId: 'u',
      expiresAt: new Date(Date.now() + 60_000 * 60),
      lastActivityAt: new Date(Date.now() - 1000),
    });
    const svc = new SessionService(prisma as never, baseConfig);
    const result = await svc.validateAndTouch('tok');
    expect(result).toEqual({ userId: 'u' });
    expect(prisma.session.update).toHaveBeenCalledTimes(1);
  });
});
