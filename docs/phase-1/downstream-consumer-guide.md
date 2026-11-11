# Downstream Service Consumer Guide

Version: 1.0
Status: Draft
Audience: Developer Inventory / Billing / Clinical / Notification Service

---

## 1. Overview

Dokumen ini menjelaskan bagaimana downstream service menerima dan memvalidasi
request yang diteruskan oleh **Gateway + Identity Service**.

Gateway melakukan:
- Validasi session cookie dari browser
- Membangun context user (userId, tenantId, branchId)
- Menandatangani **Internal JWT (EdDSA/Ed25519)**
- Meneruskan request ke downstream dengan header `X-User-Context`

Downstream service **tidak perlu** melakukan autentikasi sendiri — cukup verifikasi
JWT yang dikirim oleh Gateway.

---

## 2. Request yang Diterima Downstream

Setiap request dari Gateway memiliki struktur berikut:

```http
GET /inventory/items?page=1
X-User-Context: <Internal JWT>
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

> Gateway hanya strip `/api/v1` dari URL client — service name tetap ada.
> Client akses `/api/v1/inventory/items` → downstream terima `/inventory/items`.

### 2.1 Headers Wajib

| Header | Tipe | Keterangan |
|--------|------|------------|
| `X-User-Context` | JWT string | Internal JWT berisi identitas user, wajib diverifikasi |
| `X-Request-Id` | UUID string | Correlation ID untuk tracing log antar service |

### 2.2 Headers yang TIDAK akan Ada

| Header | Keterangan |
|--------|------------|
| `Cookie` | Cookie session browser — dihapus oleh Gateway sebelum forward |
| `Authorization`, `Proxy-Authorization` | Dibuang Gateway; tidak dipakai dalam arsitektur ini |
| `X-Tenant-Id`, `X-Branch-Id`, `X-User-Id` | Dibuang Gateway; khusus `/internal/*` antar service |
| `Content-Length`, `Connection`, `Keep-Alive`, `Transfer-Encoding`, `Upgrade`, `TE`, `Trailer` | Dibuang; dihitung ulang oleh HTTP client Gateway |

Path bersegmen `internal` dari client ditolak Gateway (404) dan tidak pernah diteruskan.

---

## 3. Struktur Internal JWT

### 3.1 Header

```json
{
  "alg": "EdDSA",
  "typ": "JWT",
  "kid": "gateway-key-v1"
}
```

### 3.2 Payload

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Siti Rahmawati",
  "tenantId": "tenant-uuid",
  "branchId": "branch-uuid",
  "roles": ["OWNER", "APOTEKER"],
  "permissions": ["inventory.dispensing.create", "inventory.item.read"],
  "sessionId": "session-uuid",
  "requestId": "req-uuid",
  "iss": "gateway-identity-service",
  "aud": "inventory-service",
  "iat": 1750000000,
  "exp": 1750000300
}
```

| Field | Tipe | Keterangan |
|-------|------|------------|
| `sub` | UUID | ID user (referensi ke tabel `user` di Identity Service) |
| `tenantId` | UUID | Tenant aktif user |
| `branchId` | UUID | Branch aktif user |
| `name` | string | Nama tampilan user, maks. 150 karakter. **Data pribadi: jangan di-log** (termasuk log error verifikasi dan log debug payload), jangan masuk `audit_log`; boleh disimpan hanya sebagai snapshot data bisnis (mis. `cashier_name`). Bila tidak ada (JWT dari Gateway lama), anggap `null`, bukan error |
| `roles` | string[] | Kode role efektif di cabang aktif, tanpa role `PLATFORM`. Hanya untuk tampilan/log/audit. Bila tidak ada, anggap `[]` |
| `permissions` | string[] | Permission efektif **hanya berprefix service ini** (mis. `inventory.`), terurut, tanpa duplikat. Keputusan akses (default-deny) berdasarkan claim ini, bukan nama role. Bila tidak ada, anggap `[]` |
| `sessionId` | UUID | ID session Better Auth |
| `requestId` | UUID | Sama dengan `X-Request-Id` header |
| `iss` | string | Selalu `gateway-identity-service` |
| `aud` | string | Nama service tujuan, misal `inventory-service` |
| `iat` | Unix ts | Waktu JWT dibuat |
| `exp` | Unix ts | Waktu JWT expired (max 5 menit dari `iat`) |

---

## 4. Cara Verifikasi JWT

### 4.1 Public Key

Gateway mendistribusikan **public key** ke semua downstream service.
Public key ini digunakan untuk memverifikasi tanda tangan JWT.

File: `certs/public.pem` (didapat dari tim Gateway)

```
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAT5bHiCXKkl6X0LhKJwLWjlJ1DjSGRDUyO0vfZWPPYAI=
-----END PUBLIC KEY-----
```

> **Distribusi key:** Salin file `certs/public.pem` ke repository downstream
> service. Jangan pernah share `private.pem`.

### 4.2 Rules Verifikasi (WAJIB)

Downstream **wajib** memvalidasi semua hal berikut:

| Rule | Detail |
|------|--------|
| Signature valid | Verify dengan public key Ed25519 |
| `alg` = `EdDSA` | Tolak token dengan algoritma lain |
| `iss` = `gateway-identity-service` | Tolak token dari issuer lain |
| `aud` = nama service sendiri | Tolak token untuk audience lain |
| `exp` belum lewat | Tolak token expired |

---

## 5. Implementasi

### 5.1 NestJS — Guard + Decorator

**Install dependency:**
```bash
npm install jose
```

**`src/shared/gateway-auth/gateway-jwt.guard.ts`**
```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { importSPKI, jwtVerify } from 'jose';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Request } from 'express';

export interface GatewayContext {
  sub: string;
  tenantId: string;
  branchId: string;
  sessionId: string;
  requestId: string;
}

@Injectable()
export class GatewayJwtGuard implements CanActivate {
  private publicKey?: CryptoKey;

  async onModuleInit(): Promise<void> {
    const pem = readFileSync(resolve(process.cwd(), './certs/public.pem'), 'utf-8');
    this.publicKey = await importSPKI(pem, 'EdDSA');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-user-context'];

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing X-User-Context header');
    }

    try {
      const { payload } = await jwtVerify(token, this.publicKey!, {
        issuer: 'gateway-identity-service',
        audience: 'inventory-service', // ganti sesuai nama service ini
        algorithms: ['EdDSA'],
      });

      (req as Request & { gatewayContext: GatewayContext }).gatewayContext = {
        sub: payload.sub as string,
        tenantId: payload['tenantId'] as string,
        branchId: payload['branchId'] as string,
        sessionId: payload['sessionId'] as string,
        requestId: payload['requestId'] as string,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired gateway token');
    }
  }
}
```

**`src/shared/gateway-auth/gateway-context.decorator.ts`**
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { GatewayContext } from './gateway-jwt.guard';

export const GetGatewayContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): GatewayContext => {
    const req = ctx.switchToHttp().getRequest<Request & { gatewayContext: GatewayContext }>();
    return req.gatewayContext;
  },
);
```

**Penggunaan di Controller:**
```typescript
@UseGuards(GatewayJwtGuard)
@Get('items')
async getItems(@GetGatewayContext() ctx: GatewayContext) {
  // ctx.tenantId  → filter data per tenant
  // ctx.branchId  → filter data per branch
  // ctx.sub       → userId untuk audit log
  return this.itemService.findAll(ctx.tenantId, ctx.branchId);
}
```

---

### 5.2 Express / Vanilla Node.js — Middleware

```typescript
import { importSPKI, jwtVerify } from 'jose';
import { readFileSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';

const pem = readFileSync('./certs/public.pem', 'utf-8');
const publicKey = await importSPKI(pem, 'EdDSA');

export async function gatewayAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers['x-user-context'];

  if (!token || typeof token !== 'string') {
    res.status(401).json({ error: 'Missing X-User-Context' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: 'gateway-identity-service',
      audience: 'inventory-service', // ganti sesuai nama service ini
      algorithms: ['EdDSA'],
    });

    (req as Request & { gatewayContext: unknown }).gatewayContext = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired gateway token' });
  }
}
```

---

### 5.3 Tenant & Branch Isolation (WAJIB)

Setelah JWT terverifikasi, downstream service **wajib** menggunakan `tenantId`
dan `branchId` dari context untuk mem-filter semua query:

```typescript
// BENAR — data di-scope per tenant dan branch
async findItems(tenantId: string, branchId: string) {
  return this.db.item.findMany({
    where: { tenantId, branchId },
  });
}

// SALAH — data tidak di-scope, risiko data bocor antar tenant
async findItemsWrong() {
  return this.db.item.findMany(); // ❌
}
```

---

## 6. Error Handling

| Kondisi | Respons yang Dikembalikan |
|---------|--------------------------|
| Header `X-User-Context` tidak ada | `401 Unauthorized` |
| JWT tidak valid / signature salah | `401 Unauthorized` |
| JWT expired | `401 Unauthorized` |
| `aud` tidak cocok dengan service ini | `401 Unauthorized` |
| `iss` bukan `gateway-identity-service` | `401 Unauthorized` |

Jangan expose detail error JWT ke client (jangan kembalikan pesan seperti
"signature verification failed") — cukup `401 Unauthorized`.

---

## 7. Observability & Logging

Downstream service **wajib** menyertakan `requestId` dari context di setiap
log entry agar request bisa di-trace dari gateway sampai downstream:

```typescript
// Ambil dari JWT context atau dari header X-Request-Id
const requestId = ctx.requestId ?? req.headers['x-request-id'];

logger.info({
  requestId,
  userId: ctx.sub,
  tenantId: ctx.tenantId,
  action: 'items.list',
});
```

---

## 8. Security Rules — Anti Bypass

| Aturan | Keterangan |
|--------|------------|
| JANGAN percaya request tanpa `X-User-Context` | Bisa jadi request langsung (bypass gateway) |
| JANGAN percaya `tenantId` / `userId` dari query param atau body | Hanya percaya dari JWT yang sudah diverifikasi |
| JANGAN izinkan algoritma `none` atau simetrik (HS256) | Paksa `EdDSA` |
| JANGAN cache JWT | Token short-lived, selalu verify setiap request |
| JANGAN log claim `name` (dan email) | Data pribadi (BR-D1B-05); berlaku di semua level log |
| JANGAN memutuskan akses dari nama role | Gunakan claim `permissions` (BR-D1B-08) |
| JANGAN expose public key path via API | Key hanya dibaca saat startup |

> **Catatan:** Downstream service sebaiknya hanya dapat diakses dari network
> internal (bukan public internet). Gateway adalah satu-satunya entry point
> yang menerima traffic dari browser.

---

## 9. Checklist Integrasi

- [ ] Salin `certs/public.pem` dari tim Gateway ke repository service
- [ ] Install `jose` dependency
- [ ] Implementasi `GatewayJwtGuard` (atau middleware equivalent)
- [ ] Verifikasi `iss`, `aud`, `alg`, dan `exp` pada setiap request
- [ ] Semua query data di-scope dengan `tenantId` + `branchId` dari JWT
- [ ] Log selalu menyertakan `requestId` dari JWT context
- [ ] Endpoint tidak dapat diakses langsung tanpa `X-User-Context`
- [ ] Unit test: JWT valid → lanjut, JWT expired → 401, JWT audience salah → 401

---

## 10. FAQ

**Q: Apakah downstream service perlu koneksi ke database Identity Service?**  
A: Tidak. Semua identitas user sudah ada di dalam JWT. Downstream tidak perlu
query ke Identity Service untuk setiap request.

**Q: Bagaimana jika public key dirotasi?**  
A: Tim Gateway akan mendistribusikan public key baru. Downstream service perlu
restart (atau reload key tanpa restart jika diimplementasikan). Koordinasikan
jadwal rotasi agar tidak ada downtime.

**Q: Apakah JWT bisa di-cache?**  
A: Tidak disarankan. JWT hanya berlaku 5 menit dan selalu unik per request.
Verifikasi signature sangat cepat (Ed25519 sub-millisecond), tidak perlu cache.

**Q: Apakah downstream bisa memanggil service lain?**  
A: Untuk service-to-service call (tanpa browser), gunakan JWT yang sama
(`X-User-Context`) yang diterima — teruskan ke service berikutnya. Downstream
tidak membuat JWT baru; hanya Gateway yang bisa membuat dan menandatangani JWT.
