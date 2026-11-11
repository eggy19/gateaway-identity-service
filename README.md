# Gateway & Identity Service

Healthcare SaaS — central identity platform. **Phase 1 (MVP)**: Authentication, User, Tenant, Branch, Session, and Login Security.

See [`docs/`](./docs) for the authoritative standards and phase plan:

- [`docs/CLAUDE-STANDARD.md`](./docs/CLAUDE-STANDARD.md) — coding standards (LOCKED)
- [`docs/CLAUDE-ARCHITECTURE.md`](./docs/CLAUDE-ARCHITECTURE.md) — architecture rules (LOCKED)
- [`docs/phase-1/identity-service-phase-1.md`](./docs/phase-1/1-identity-service-phase-1.md) — Phase 1 scope

## Tech Stack

Node.js · TypeScript (strict) · NestJS 11 · TypeORM · PostgreSQL · Better Auth (cookie session)

## Project Structure

```
src/
  config/        # Environment config + validation
  database/      # TypeORM data source, module, migrations
  common/        # Cross-cutting building blocks (BaseEntity, ...)
  shared/        # Response envelope, interceptor, exception filter, decorators
  modules/       # Feature modules (each owns controller/service/repository/...)
    health/      # Liveness endpoint
```

Each feature module owns its own Controller, Service, Repository, Entity, DTOs,
Mapper, Validators, and Constants. Modules interact only through public services —
never via another module's repository or tables.

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env   # then edit values

# 3. Run (watch mode)
npm run start:dev
```

Health check: `GET http://localhost:3000/api/health`

## Database Migrations

Schema changes go through migrations (no `synchronize` in any environment):

```bash
npm run migration:generate -- src/database/migrations/<Name>
npm run migration:run
npm run migration:revert
```

The Better Auth tables (`user`, `account`, `session`, `verification`) are created
from Better Auth's own generated DDL, transcribed into the `InitPhase1` migration
so the whole schema lives in one pipeline. Regenerate that DDL (against an empty
DB) with `npx ts-node -T scripts/generate-better-auth-sql.ts`.

## Seeding

Creating a tenant/user normally requires an authenticated user, so a seed script
bootstraps the first tenant (+ default branch) and an admin:

```bash
npx ts-node -T scripts/seed.ts
# override defaults: SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npx ts-node -T scripts/seed.ts
```

Default admin: `admin@clinic.test` / `Admin12345!`.

## API Overview (Phase 1)

All routes are under `/api/v1`. Every route except `POST /auth/login` and
`GET /health` requires a valid Better Auth cookie session.

| Area     | Endpoints                                                                 |
| -------- | ------------------------------------------------------------------------- |
| Auth     | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/session`, `DELETE /auth/session/:id` |
| Sessions | `GET /sessions`, `DELETE /sessions/:id`                                   |
| Users    | `GET /users`, `GET /users/:id`, `POST /users`, `PUT /users/:id`, `PATCH /users/:id/status` |
| Tenants  | `GET /tenants`, `GET /tenants/:id`, `POST /tenants`, `PUT /tenants/:id`   |
| Branches | `GET /branches`, `GET /branches/:id`, `POST /branches`, `PUT /branches/:id` |

Every request carries an `X-Request-Id` (generated, or echoed from the inbound
header) and is logged as a single line on completion.

## Testing

```bash
npm test           # unit tests (Jest)
npm run test:cov   # with coverage
npm run test:db    # integration tests against local PostgreSQL (self-cleaning test data)
```

## API Conventions

- **Success**: `{ success: true, message, data }`
- **Error**: `{ success: false, message, error, timestamp, path }`

Stack traces and internal details are never exposed to clients.
