# E-commerce Mini-App

A focused take-home: a secure login, an infinite-scroll product catalogue, role-based access
control, an encrypted-at-rest user store, and a hardened reverse proxy. Built for senior-level
review, so the focus is on architectural and security choices rather than feature surface.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router) + React 19, Tailwind 4 |
| Backend | NestJS 10 + Prisma 5 |
| Database | PostgreSQL 16 |
| Cache / rate limit / sessions backing | Redis 7 |
| Reverse proxy | Nginx 1.27 (security headers, login rate limit) |
| Workspace | pnpm + monorepo (`apps/api`, `apps/web`) |
| CI | GitHub Actions: lint, typecheck, test, build for both apps |

## Layout

```
apps/
  api/                NestJS service
    src/
      auth/           login, csrf, session guard, permissions guard
      crypto/         AES-256-GCM + HMAC for searchable encrypted PII
      sessions/       server-side sessions with sliding inactivity
      users/          user lookup + RBAC permission resolution
      products/       cursor-paginated catalogue
      prisma/         Prisma service
      redis/          shared ioredis client
      config/         zod-validated env loader
    prisma/           schema + seed
    test/             Jest unit tests, no DB required
  web/                Next.js storefront
    src/app/login     login page (honeypot, CSRF-aware client)
    src/app/products  virtualised infinite scroll, configurable page size
    src/lib           api client with credential + CSRF handling
nginx/                hardened reverse-proxy config
.github/workflows/    CI pipeline
docker-compose.yml    postgres + redis + nginx
```

## Running locally

Requirements: **Node 22.13+**, **pnpm 11+**, **Docker** (Desktop or daemon running).

The fastest path is the setup script, which copies `.env`, generates fresh
`ENCRYPTION_KEY` and `CSRF_SECRET`, brings up Postgres + Redis + Nginx, applies
migrations, and seeds the database.

```bash
pnpm setup
pnpm dev
```

That is the whole thing. The catalogue is then live with **200 seeded products** and an
admin user ready to log in.

Open one of:

- `http://localhost:3000` — Next.js dev server directly
- `http://localhost:8085` — the same app behind Nginx with the hardened headers and
  login rate-limit zone

Default admin login:

```
email:    admin@example.com
password: Admin#12345
```

### Manual steps (equivalent to `pnpm setup`)

If you prefer to run the steps yourself:

```bash
cp .env.example .env
cp .env apps/api/.env                       # Prisma CLI and NestJS read .env from cwd
# optionally regenerate secrets:
#   openssl rand -hex 32  -> set as ENCRYPTION_KEY (in both .env files)
#   openssl rand -hex 32  -> set as CSRF_SECRET
pnpm install
pnpm infra:up
pnpm --filter @ecom/api exec prisma migrate deploy
pnpm --filter @ecom/api db:seed
pnpm dev
```

### Running the tests

```bash
pnpm --filter @ecom/api test    # unit tests, mocked Prisma, no DB needed
```

### Tearing it down

```bash
pnpm infra:down                 # stops and removes Postgres / Redis / Nginx
```

### Infrastructure

`docker-compose.yml` defines three services. All ports are non-default so they will not
clash with anything else already running on your machine.

| Service  | Container       | Host port → container port | Purpose |
| -------- | --------------- | -------------------------- | --- |
| Postgres | `ecom_postgres` | `5436` → `5432`            | data store |
| Redis    | `ecom_redis`    | `6380` → `6379`            | throttler + short-lived state |
| Nginx    | `ecom_nginx`    | `8085` → `80`              | reverse proxy with security headers |

The api process listens on `:4000`, the web dev server on `:3000`. Nginx fronts both at
`http://localhost:8085`.

### If something gets stuck

The most common causes of "it was working a minute ago" are a stale Node process holding
port 4000 or 3000, or a half-stopped Docker container. Reset cleanly with:

```bash
pnpm infra:down                                   # remove containers + volumes
pkill -f "nest start" 2>/dev/null                 # kill api dev
pkill -f "next dev"  2>/dev/null                  # kill web dev
pkill -f "node.*dist/main.js" 2>/dev/null         # kill any built api
```

Then start over:

```bash
pnpm setup
pnpm dev
```

A few specific symptoms and what they usually mean:

- **`Cannot connect to the Docker daemon`** — Docker Desktop is not running. Open it
  from Applications, wait until the menu-bar icon says "running", then re-run.
- **`Bind for 0.0.0.0:5436 failed: port is already allocated`** — another Postgres is
  already bound to 5436. Either stop that one or change `POSTGRES_PORT` in `.env` and
  `docker-compose.yml`.
- **`Failed to proxy http://localhost:4000`** in the `apps/web dev` log — the api did
  not start. Scroll up in the same terminal for the real api error (usually a TypeScript
  error from a stale Prisma client; `pnpm --filter @ecom/api exec prisma generate` fixes
  it).
- **`Invalid credentials` even with the seeded password** — usually means the api is
  running against a different `ENCRYPTION_KEY` than the one that seeded the database.
  Restart the dev servers (`Ctrl+C` then `pnpm dev`) so the api re-reads `apps/api/.env`.
- **`Too many failed attempts`** — the brute-force protection has kicked in. Either wait
  15 minutes or clear it with
  `docker exec ecom_redis redis-cli FLUSHALL && docker exec ecom_postgres psql -U ecom -d ecom -c "DELETE FROM login_attempts;"`.

### Re-seeding from scratch

If you want a fresh database without changing anything else:

```bash
pnpm --filter @ecom/api db:reset --force          # drops schema, re-migrates, re-seeds
```

## Architecture notes

### Authentication

- **Passwords** hashed with **argon2id** (memory-hard, modern).
- **Sessions are server-side**, keyed by an opaque cryptographic token in an HttpOnly,
  SameSite=Lax cookie. Long `maxAge` so the cookie survives a browser restart — that is the
  "persistent session" requirement.
- **Sliding 30-minute inactivity** — every authenticated request bumps `last_activity_at`;
  the session guard refuses any request more than 30 minutes idle and deletes the row. The
  cookie still has its 30-day cap as a hard upper bound.
- **Brute-force defence is layered**:
  1. NestJS `@nestjs/throttler` backed by Redis — a hot path that rejects bursts before
     they ever touch the database.
  2. A persistent `login_attempt` table with a per-user lockout window — survives restarts
     and gives an audit trail.
- **Phantom verify**: when an unknown email is used, `argon2.verify` is still run against a
  fixed hash so the response time does not leak whether the user exists.
- **CSRF** is the double-submit cookie pattern via `csrf-csrf`. The frontend reads the token
  from `GET /api/auth/csrf` and echoes it as `X-CSRF-Token` on every mutating request. The
  middleware ignores GET/HEAD/OPTIONS, so the token endpoint itself is fine. SameSite=Lax on
  the session cookie is defence in depth.
- **Honeypot**: the login form ships a hidden `website` input. Real users do not see it;
  bots fill it; the API rejects the request.

### At-rest encryption (PII)

Emails are stored as two columns:

- `email_ciphertext` — `AES-256-GCM(plaintext)` with a per-row random 96-bit IV,
  encoded as `base64(iv || tag || ciphertext)`.
- `email_hash` — `HMAC-SHA256(normalised_email)` with the same secret, used as the unique
  index for lookups.

The database never sees plaintext email; the secret is held only in `ENCRYPTION_KEY`. To
look a user up by email the service hashes the input and queries by `email_hash`. To display
the email it decrypts the ciphertext. `EmailCryptoService` is the only place that knows
about the layout.

### RBAC + per-permission grants

Effective permissions are computed as:

```
role permissions  ∪  direct ALLOW grants  −  direct DENY grants
```

Modelled across five tables (`roles`, `permissions`, `role_permissions`, `user_roles`,
`user_permissions` with an `effect` enum). The `PermissionsGuard` reads the
`@Permissions('product:list')` metadata and rejects requests whose user's effective set is
missing any required code. Resolution happens once per request inside the auth guard.

### Catalogue pagination

- **Cursor-based**, not offset — offset is linear in row position and dies on hot tables.
- Cursor is an opaque base64url payload `{ createdAt, id }` so ordering is stable even when
  many rows share the same timestamp.
- The SQL `WHERE` uses a manual tuple comparison
  (`createdAt < cursor.createdAt OR (createdAt = cursor.createdAt AND id < cursor.id)`),
  backed by a composite index `(is_active, created_at DESC, id DESC)`.
- The controller validates `limit` to the inclusive range `[5, 50]` via class-validator.
- The service queries `take: limit + 1` so it can detect "is there more" without a second
  round-trip.
- The **default page size is 20**. The brief requires the value to be user-configurable
  between 5 and 50, and the UI exposes a number input that clamps to that range, but a
  default has to be picked. 20 is small enough to keep the initial payload light (a few KB
  of JSON), large enough to fill a typical viewport in a single request — which keeps the
  first-paint fast without an extra round-trip for "fill the screen". Page sizes at the
  extremes (5 and 50) work identically; the only thing changing between them is the
  request batch size.

### Frontend performance

- **TanStack Query `useInfiniteQuery`** keeps pages cached and exposes `hasNextPage`.
- **`@tanstack/react-virtual`** renders only the visible rows. Even a 50-row page across
  many fetches keeps the DOM at a few dozen nodes.
- A sentinel virtual row at `items.length` triggers `fetchNextPage` when scrolled into view.
- Changing the page-size selector clears the cached query so the list restarts cleanly
  from page 1.

### Nginx

Sits in front of both apps and applies:

- A strict header set: `Content-Security-Policy`, `Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- A request body cap (`client_max_body_size 1m`).
- A rate-limit zone targeting `/api/auth/login` specifically.
- A general API zone protecting `/api/`.
- `server_tokens off` to avoid leaking the Nginx version.

In production you would add TLS termination here; local dev runs HTTP on `:8080`.

### Configuration

Every environment variable is validated by a zod schema on boot. If a value is missing or
malformed (e.g. `ENCRYPTION_KEY` not 64 hex chars), the API refuses to start with a clear
message rather than crashing later in an obscure place.

## CI/CD

`.github/workflows/ci.yml` runs three jobs on every push and pull request:

- **api** — install (frozen lockfile), `prisma generate`, typecheck, unit tests, build.
- **web** — install, typecheck, Next.js production build.
- **docker** — validates `docker-compose.yml` (`docker compose config --quiet`).

Unit tests use Jest with mocked Prisma — no database is needed to run them. The integration
side (real Postgres + Redis) is intentionally left to local `pnpm infra:up` so the CI loop
stays fast.

## Future work

- An integration-test job in CI with a Postgres + Redis service container.
- Refresh-token rotation and an admin view of active sessions / "log out everywhere".
- CAPTCHA fallback after repeated IP-level lockouts, gated on a feature flag.
- TLS at the Nginx layer with a real certificate.
- A background job to prune expired sessions and old `login_attempt` rows.
- Granular permission scopes per resource id (e.g. `product:update:<id>`) once a real
  multi-tenant model is needed.
