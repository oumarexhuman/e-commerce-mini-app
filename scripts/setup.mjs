import { execSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

function step(title) {
  console.log(`\n→ ${title}`);
}

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

function ensureEnvFile() {
  if (existsSync('.env')) return;
  step('Creating .env from .env.example');
  copyFileSync('.env.example', '.env');

  let contents = readFileSync('.env', 'utf8');
  const key = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  contents = contents.replace(/^ENCRYPTION_KEY=.*/m, `ENCRYPTION_KEY=${key}`);
  contents = contents.replace(/^CSRF_SECRET=.*/m, `CSRF_SECRET=${csrf}`);
  writeFileSync('.env', contents);
  console.log('  generated ENCRYPTION_KEY and CSRF_SECRET');
}

ensureEnvFile();

step('Syncing .env into apps/api (so Prisma and NestJS find it)');
const apiEnvPath = 'apps/api/.env';
mkdirSync(dirname(apiEnvPath), { recursive: true });
copyFileSync('.env', apiEnvPath);

step('Installing dependencies');
run('pnpm install');

step('Generating Prisma client');
run('pnpm --filter @ecom/api exec prisma generate');

step('Starting Postgres, Redis and Nginx');
run('pnpm infra:up');

step('Applying database migrations');
run('pnpm --filter @ecom/api exec prisma migrate deploy');

step('Seeding the database');
run('pnpm --filter @ecom/api db:seed');

console.log(`
Setup complete.

Run the app:
  pnpm dev

Then open:
  http://localhost:3000   (Next.js dev server)
  http://localhost:8085   (through Nginx with security headers)

Default admin login:
  email:    admin@example.com
  password: Admin#12345
`);
