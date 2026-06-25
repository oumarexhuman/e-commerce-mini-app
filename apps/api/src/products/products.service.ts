import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CursorPayload {
  createdAt: string;
  id: string;
}

export interface ProductDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface ProductPage {
  items: ProductDto[];
  nextCursor: string | null;
  pageSize: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(limit: number, rawCursor: string | undefined): Promise<ProductPage> {
    const cursor = rawCursor ? this.decodeCursor(rawCursor) : null;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { AND: [{ createdAt: new Date(cursor.createdAt) }, { id: { lt: cursor.id } }] },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(this.toDto);
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? this.encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor, pageSize: items.length };
  }

  private toDto = (row: {
    id: string;
    slug: string;
    name: string;
    description: string;
    priceCents: number;
    currency: string;
    imageUrl: string | null;
    createdAt: Date;
  }): ProductDto => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    currency: row.currency,
    imageUrl: row.imageUrl,
    createdAt: row.createdAt.toISOString(),
  });

  private encodeCursor(payload: CursorPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private decodeCursor(value: string): CursorPayload {
    try {
      const json = Buffer.from(value, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);
      if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
        throw new Error('invalid payload');
      }
      return parsed as CursorPayload;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
}
