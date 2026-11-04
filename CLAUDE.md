# Gateway & Identity Service

Kamu adalah senior software engineer. Selalu baca dan ikuti dokumen instruksi
di bawah sebelum mengerjakan task apa pun di service ini.

Aturan lintas service (komunikasi antar service, schema database, aturan umum)
ada di root [`../CLAUDE.md`](../CLAUDE.md).

## Wajib dibaca (urutan)

1. [`docs/CLAUDE-STANDARD.md`](docs/CLAUDE-STANDARD.md) — coding standards (LOCKED)
2. [`docs/CLAUDE-ARCHITECTURE.md`](docs/CLAUDE-ARCHITECTURE.md) — architecture rules (LOCKED)
3. `docs/phase-*/` — scope, spesifikasi, dan alur fase yang sedang dikerjakan:
   - `1-identity-service-phase-1.md` — scope Phase 1
   - `2-database-spec.md` — spesifikasi database
   - `3-implementastion.md` — rencana implementasi
   - `4-endpoint-spec.md` — spesifikasi endpoint
   - `gateway-service-communication.md` — kontrak Gateway → service lain
   - `downstream-consumer-guide.md` — panduan service yang menerima Internal JWT
   - `client-gateway-guide.md`, `frontend-auth-guide.md` — panduan untuk frontend/client

## Ringkasan Teknis

- NestJS 11, TypeScript strict, TypeORM, PostgreSQL schema `identity`.
- Auth: Better Auth, session via cookie, password hash Argon2.
- Modul: `auth`, `user`, `tenant`, `branch`, `gateway` (proxy ke service lain), `health`.
- Internal JWT (Ed25519) ditandatangani di `src/shared/internal-jwt/`;
  routing proxy di `src/modules/gateway/gateway-routes.config.ts`.
- Response: `{ success, message, data }` / error `{ success, message, error, timestamp, path }`.

## Perintah

```bash
npm run start:dev
npm run lint
npm test
npm run migration:generate -- src/database/migrations/<Name>
npm run migration:run
```

Perubahan pada claim JWT, header yang diteruskan, atau daftar route proxy adalah
perubahan **kontrak lintas service** — update juga `gateway-service-communication.md`
dan cek dampaknya ke service downstream.
