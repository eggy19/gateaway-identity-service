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
* Validasi access control sebelum request diteruskan

Contoh permission:

```text
inventory.item.read
inventory.item.create
billing.invoice.create
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
  "tenantId": "tenant-uuid",
  "branchId": "branch-uuid",
  "roles": ["ADMIN"],
  "permissions": [
    "inventory.item.read",
    "inventory.item.create"
  ],
  "sessionId": "session-uuid",
  "requestId": "trace-id",
  "iss": "gateway-identity-service",
  "aud": "inventory-service",
  "iat": 1710000000,
  "exp": 1710000300
}
```

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
3. Retrieve roles & permissions
4. Validate access rights
5. Generate Internal JWT
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
X-Tenant-Id: <uuid> (optional fallback)
X-Branch-Id: <uuid> (optional fallback)
```

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
