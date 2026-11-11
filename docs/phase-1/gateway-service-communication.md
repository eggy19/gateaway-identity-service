# Gateway Service-to-Service Communication Specification

Version: 1.0  
Service: Gateway + Identity Service  
Status: Draft  
Scope: Internal Microservice Communication (Gateway → Downstream Services)

---

# 1. Purpose

Dokumen ini menjelaskan bagaimana **Gateway + Identity Service** mengirimkan context user ke downstream services seperti:

- Inventory Service
- Clinical Service
- Billing Service
- Notification Service

Gateway berfungsi sebagai:

- Authentication Layer (Session Validation)
- Authorization Layer (RBAC)
- Context Provider (Tenant, Branch, User Context)
- Internal JWT Issuer (Service-to-Service Token)

---

# 2. High-Level Architecture

```text
Browser
   │
   │ Cookie Session (Better Auth)
   ▼
Gateway + Identity Service
   │
   │ 1. Validate Session
   │ 2. Load User Context
   │ 3. Load Roles & Permissions
   │ 4. Build Internal JWT
   │ 5. Sign JWT (PRIVATE KEY)
   ▼
Downstream Services (Inventory / Clinical / Billing)
   │
   │ Verify JWT (PUBLIC KEY)
   ▼
Business Logic Execution
````

---

# 3. Responsibilities of Gateway

Gateway bertanggung jawab penuh terhadap:

## 3.1 Authentication

* Validasi session cookie dari browser
* Integrasi dengan Better Auth
* Menolak request jika session invalid

---

## 3.2 Authorization

* Load user roles
* Load permissions
* Validasi konteks aktif sebelum request diteruskan (user aktif, tenant dan cabang aktif; selain itu 403)

Gateway **tidak** memetakan route proxy ke permission. Enforcement permission untuk
route proxy dilakukan di service tujuan (default-deny) berdasarkan claim `permissions`
(BR-D1B-09). Service tujuan memutuskan akses berdasarkan **permission**, bukan nama role.

Roles dan permission dihitung oleh **satu resolver konteks aktif** (`ActiveContextService`,
`src/modules/role/services/active-context.service.ts`) yang juga dipakai `/auth/me` dan
login (BR-D1B-01/11). Resolver dijalankan di setiap request, tanpa cache (BR-D1B-06).

Contoh permission:

```text
inventory.item.read
inventory.item.create
billing.sale.create
```

---

## 3.3 Context Enrichment

Gateway menambahkan context berikut:

* user_id
* tenant_id
* branch_id
* roles
* permissions
* session_id

---

## 3.4 Internal JWT Issuance

Gateway membuat **Internal JWT (JWS)** untuk komunikasi antar service.

JWT ini:

* Ditandatangani menggunakan PRIVATE KEY
* Tidak disimpan di database
* Bersifat stateless
* Expiry sangat pendek (1–5 menit)

---

# 4. Internal JWT Structure

## 4.1 Header

```json
{
  "alg": "EdDSA",
  "typ": "JWT",
  "kid": "gateway-key-v1"
}
```

---

## 4.2 Payload

```json
{
  "sub": "user-uuid",
  "name": "Siti Rahmawati",
  "tenantId": "tenant-uuid",
  "branchId": "branch-uuid",
  "roles": ["OWNER", "APOTEKER"],
  "permissions": [
    "inventory.item.read",
    "inventory.dispensing.create"
  ],
  "sessionId": "session-uuid",
  "requestId": "trace-id",
  "iss": "gateway-identity-service",
  "aud": "inventory-service",
  "iat": 1710000000,
  "exp": 1710000300
}
```

Aturan claim (T-16b, spec prasyarat-kasir BR-D1B-05):

* `roles`: semua kode role efektif user di cabang aktif, **kecuali** role `PLATFORM`
  (mis. `SUPER_ADMIN`). Hanya untuk tampilan/log/audit, bukan untuk keputusan akses.
* `permissions`: hanya permission berprefix `<service tujuan>.`. Prefix = kunci route
  di `GATEWAY_ROUTES` (`inventory`, `billing`, `clinical`, `notification`); tidak ada
  mapping kedua. Permission `identity.*` tidak pernah masuk JWT. Tanpa duplikat, terurut
  alfabetis (BR-D1B-12).
* `name`: nama tampilan user, di-trim lalu dipotong 150 karakter (per karakter, bukan
  byte). Selalu string (`""` bila kosong). Dikirim ke semua audience (KP-34).
  **Data pribadi: dilarang di-log** oleh Gateway maupun downstream di level apa pun, dan
  tidak boleh masuk `audit_log`; downstream hanya boleh menyimpannya sebagai snapshot data
  bisnis (mis. `cashier_name`).
* User tanpa role di cabang aktif tetap diproxy dengan `roles: []`, `permissions: []`;
  downstream yang menolak (403) (BR-D1B-07).
* Ketiga claim bersifat aditif. JWT dari Gateway lama (tanpa `name`/`roles`/`permissions`)
  harus tetap diterima downstream: perlakukan `name` sebagai `null`, `roles` dan
  `permissions` sebagai `[]`.
* Ukuran: payload OWNER + `name` 150 karakter multi-byte tetap jauh di bawah 4 KB
  (header `X-User-Context` akun seed OWNER dengan 29 permission inventory: sekitar 1,8 KB).

---

## 4.3 Signature

Signed menggunakan:

* Algorithm: Ed25519 (recommended)
* Private Key: Gateway only

---

# 5. Request Flow

## 5.1 Incoming Request from Browser

```http
GET /inventory/items
Cookie: session=abc123
```

---

## 5.2 Gateway Processing

Gateway melakukan:

1. Validate session
2. Retrieve user profile
3. Resolve konteks aktif: branch primary, status tenant/cabang, roles & permissions
4. Tolak 403 `Tenant atau cabang tidak aktif` bila tenant/cabang nonaktif atau terhapus
   (BR-D1B-02). Gateway tidak memetakan route ke permission; downstream yang menegakkan
   permission (BR-D1B-09)
5. Generate Internal JWT (roles, permissions berprefix service tujuan, name)
6. Forward request to Inventory

---

## 5.3 Forward Request to Service

```http
GET /items

X-User-Context: <JWT>
X-Request-Id: uuid
```

---

# 6. HTTP Headers Standard

Gateway wajib mengirim header berikut ke semua downstream services:

## 6.1 Required Headers

```http
X-User-Context: <JWT>
X-Request-Id: <uuid>
```

`X-Tenant-Id` / `X-Branch-Id` **tidak** dikirim Gateway ke downstream dan header dari client
dibuang (BR-M2-04). Header itu khusus endpoint `/internal/*` antar service (BR-B2-01).
Tenant dan cabang selalu dari claim JWT.

---

# 7. Security Rules

## 7.1 JWT Must Be Signed

* Tidak boleh ada unsigned token
* Tidak boleh menggunakan plaintext header context

---

## 7.2 Short TTL

* Default expiry: 60–300 seconds
* Tidak boleh lebih dari 5 menit

---

## 7.3 Audience Restriction

```json
"aud": "inventory-service"
```

* Token hanya valid untuk service tertentu
* Tidak bisa dipakai lintas service sembarangan

---

## 7.4 Private Key Ownership

* Hanya Gateway yang memiliki PRIVATE KEY
* Tidak boleh dibagikan ke service lain

---

# 8. Error Handling

## 8.1 Invalid Session

```http
401 Unauthorized
```

---

## 8.2 Forbidden Access

```http
403 Forbidden
```

---

## 8.3 Invalid JWT Forwarding

```http
401 Invalid Token
```

---

# 9. Observability

Gateway wajib menambahkan:

* request_id untuk tracing
* log user_id
* log tenant_id
* log endpoint access

Gateway mencatat satu baris log per request proxy, tanpa body, header, maupun query string:

```
proxy service=inventory method=GET path=/api/v1/inventory/items status=200 durationMs=12 requestId=<uuid> userId=<id> tenantId=<id>
```

Level: `debug` normal, `warn` jika downstream 5xx, `error` jika downstream tidak terjangkau.
`X-Request-Id` dari client hanya dipakai jika berformat UUID.

Contoh log:

```json
{
  "requestId": "abc-123",
  "userId": "user-1",
  "tenantId": "tenant-1",
  "endpoint": "/inventory/items"
}
```

---

# 10. Summary

Gateway memiliki peran utama sebagai:

* Authentication Gateway
* Authorization Engine
* Context Builder
* Internal JWT Issuer
* Single Source of Truth for Identity

Downstream services tidak boleh:

* Melakukan login logic
* Menyimpan session
* Menghitung permission
* Mengelola user data

Semua itu berada di Gateway.

```

---

Kalau sudah oke, saya akan lanjutkan dokumen kedua:

👉 **Inventory Service (Consumer Side) – JWT Verification & Security Rules**

Dokumen itu akan menjelaskan:

- cara verify public key
- cara decode context
- cara enforce tenant/branch isolation
- rules security di service layer
- anti bypass rules

Tinggal bilang saja: **“lanjut inventory doc”** 👍
```
