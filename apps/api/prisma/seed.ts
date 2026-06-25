import 'dotenv/config';
import { PrismaClient, PermissionEffect } from '@prisma/client';
import * as argon2 from 'argon2';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { code: 'product:list', description: 'List products' },
  { code: 'product:read', description: 'Read a single product' },
  { code: 'product:create', description: 'Create products' },
  { code: 'product:update', description: 'Update products' },
  { code: 'product:delete', description: 'Delete products' },
  { code: 'user:manage', description: 'Manage users and assignments' },
] as const;

const ROLES = [
  {
    code: 'admin',
    name: 'Administrator',
    description: 'Full access',
    permissions: PERMISSIONS.map((p) => p.code),
  },
  {
    code: 'customer',
    name: 'Customer',
    description: 'Browse catalogue',
    permissions: ['product:list', 'product:read'],
  },
] as const;

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY env var must be 64 hex characters');
  }
  return Buffer.from(hex, 'hex');
}

function encryptEmail(email: string): { ciphertext: string; hash: string } {
  const k = key();
  const normalized = email.trim().toLowerCase();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, tag, ct]).toString('base64'),
    hash: createHmac('sha256', k).update(normalized).digest('hex'),
  };
}

const PRODUCT_ADJECTIVES = ['Classic', 'Modern', 'Premium', 'Eco', 'Smart', 'Compact', 'Vintage', 'Pro', 'Ultra', 'Essential'];
const PRODUCT_NOUNS = ['Backpack', 'Headphones', 'Sneakers', 'Watch', 'Lamp', 'Mug', 'Keyboard', 'Mouse', 'Bottle', 'Notebook', 'Chair', 'Camera', 'Speaker', 'Wallet', 'Cap'];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function upsertPermissions(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description },
      create: { code: p.code, description: p.description },
    });
    map.set(p.code, row.id);
  }
  return map;
}

async function upsertRoles(permissionIds: Map<string, string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const role of ROLES) {
    const row = await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: { code: role.code, name: role.name, description: role.description },
    });
    map.set(role.code, row.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: row.id } });
    await prisma.rolePermission.createMany({
      data: role.permissions.map((code) => ({
        roleId: row.id,
        permissionId: permissionIds.get(code)!,
      })),
    });
  }
  return map;
}

async function upsertAdmin(roleIds: Map<string, string>): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin#12345';
  const { ciphertext, hash } = encryptEmail(email);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const existing = await prisma.user.findUnique({ where: { emailHash: hash } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { emailCiphertext: ciphertext, passwordHash, displayName: 'Administrator', isActive: true },
      })
    : await prisma.user.create({
        data: {
          emailCiphertext: ciphertext,
          emailHash: hash,
          passwordHash,
          displayName: 'Administrator',
          isActive: true,
        },
      });

  const adminRoleId = roleIds.get('admin')!;
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRoleId } },
    update: {},
    create: { userId: user.id, roleId: adminRoleId },
  });
}

async function seedProducts(): Promise<void> {
  const count = await prisma.product.count();
  if (count >= 200) return;

  const seedRng = (n: number): number => {
    const x = Math.sin(n) * 10000;
    return x - Math.floor(x);
  };

  const data = Array.from({ length: 200 }, (_, i) => {
    const adjective = PRODUCT_ADJECTIVES[i % PRODUCT_ADJECTIVES.length]!;
    const noun = PRODUCT_NOUNS[(i * 3) % PRODUCT_NOUNS.length]!;
    const name = `${adjective} ${noun} ${String(i + 1).padStart(3, '0')}`;
    const slug = slugify(`${name}`);
    const priceCents = Math.round(500 + seedRng(i + 1) * 19500);
    return {
      slug,
      name,
      description: `${name} — a ${adjective.toLowerCase()} take on the everyday ${noun.toLowerCase()}.`,
      priceCents,
      currency: 'USD',
      imageUrl: null,
      isActive: true,
    };
  });

  await prisma.product.createMany({ data, skipDuplicates: true });
}

async function main(): Promise<void> {
  const permissions = await upsertPermissions();
  const roles = await upsertRoles(permissions);
  await upsertAdmin(roles);
  await seedProducts();
  console.log('Seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
