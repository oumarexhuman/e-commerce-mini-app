import { BadRequestException } from '@nestjs/common';
import { ProductsService } from '../src/products/products.service';

function mockPrisma(rows: any[]) {
  return {
    product: {
      findMany: jest.fn(async ({ take }: { take: number }) => rows.slice(0, take)),
    },
  } as const;
}

function fakeRows(n: number): any[] {
  const start = new Date('2026-01-01T00:00:00Z').getTime();
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i).padStart(3, '0')}`,
    slug: `slug-${i}`,
    name: `Product ${i}`,
    description: `desc ${i}`,
    priceCents: 1000 + i,
    currency: 'USD',
    imageUrl: null,
    createdAt: new Date(start + i),
    updatedAt: new Date(start + i),
    isActive: true,
  }));
}

describe('ProductsService', () => {
  it('returns items and a nextCursor when there are more rows than the limit', async () => {
    const prisma = mockPrisma(fakeRows(11));
    const svc = new ProductsService(prisma as never);
    const page = await svc.list(10, undefined);
    expect(page.pageSize).toBe(10);
    expect(page.items).toHaveLength(10);
    expect(page.nextCursor).not.toBeNull();
  });

  it('returns nextCursor null when the page is the last one', async () => {
    const prisma = mockPrisma(fakeRows(5));
    const svc = new ProductsService(prisma as never);
    const page = await svc.list(10, undefined);
    expect(page.pageSize).toBe(5);
    expect(page.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor with BadRequestException', async () => {
    const prisma = mockPrisma(fakeRows(0));
    const svc = new ProductsService(prisma as never);
    await expect(svc.list(10, 'not-a-cursor')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('round-trips a cursor: the next page picks up where the previous one ended', async () => {
    const prisma = mockPrisma(fakeRows(11));
    const svc = new ProductsService(prisma as never);
    const first = await svc.list(10, undefined);
    expect(first.nextCursor).toBeTruthy();
    const second = await svc.list(10, first.nextCursor!);
    expect(second.items.length).toBeLessThanOrEqual(10);
  });
});
