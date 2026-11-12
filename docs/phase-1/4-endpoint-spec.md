# API Specification

Version: 1.0
Module: Gateway + Identity Service
Phase: 1 (MVP)
Status: Draft

## Purpose

Dokumen ini mendefinisikan spesifikasi seluruh REST API yang digunakan pada Gateway + Identity Service untuk Phase 1.

Dokumen ini menjadi acuan implementasi backend, frontend, QA, serta AI Coding Agent agar seluruh endpoint memiliki standar yang konsisten.

---

# Scope

Phase 1 mencakup API untuk:

* Authentication
* User Management
* Tenant Management
* Branch Management
* Session Management

---

# API Standards

Seluruh endpoint menggunakan:

* RESTful API
* JSON Request & Response
* HTTPS
* Cookie-Based Authentication
* UTF-8 Encoding

Response harus memiliki struktur yang konsisten.

---

# Authentication API

Endpoint:

* POST /auth/login
* POST /auth/logout
* GET /auth/me
* GET /auth/session
* DELETE /auth/session/{sessionId}

Setiap endpoint mendefinisikan:

* Purpose
* Request
* Response
* Validation
* Error Response
* Authentication Requirement

---

# User API

Endpoint:

* GET /users
* GET /users/{id}
* POST /users
* PUT /users/{id}
* PATCH /users/{id}/status

Fungsi:

* Create User
* Update User
* View User
* Activate User
* Deactivate User

---

# Tenant API

Endpoint:

* GET /tenants
* GET /tenants/{id}
* POST /tenants
* PUT /tenants/{id}

Fungsi:

* Create Tenant
* Update Tenant
* View Tenant

---

# Branch API

Endpoint:

* GET /branches
* GET /branches/{id}
* POST /branches
* PUT /branches/{id}

Fungsi:

* Create Branch
* Update Branch
* View Branch

---

# Session API

Endpoint:

* GET /sessions
* DELETE /sessions/{id}

Fungsi:

* List Active Sessions
* Logout Selected Session

---

# Request Standard

Seluruh request harus:

* Menggunakan Content-Type: application/json
* Menggunakan Cookie Authentication
* Mengikuti DTO Validation
* Menggunakan UUID sebagai identifier

---

# Response Standard

Seluruh response mengikuti format yang konsisten.

Response terdiri dari:

* status
* message
* data
* metadata (optional)

---

# Error Response

Seluruh error mengikuti format yang konsisten.

Kategori error:

* Validation Error
* Authentication Error
* Authorization Error
* Business Error
* Internal Server Error

---

# Validation Rules

Seluruh endpoint harus melakukan validasi terhadap:

* Required Field
* Data Type
* UUID Format
* String Length
* Enum
* Business Validation

---

# Authentication Rules

Endpoint dibagi menjadi dua kategori.

Public Endpoint

* Login
* Password Reset (Future)
* Email Verification (Future)

Protected Endpoint

* Seluruh endpoint selain Public Endpoint.

---

# Authorization Rules

Phase 1 belum menggunakan RBAC. **Diperbarui (Phase 2, G1):** endpoint milik Gateway kini dijaga
permission `identity.*` (default-deny) dan dibatasi scope tenant. Sumber aturan:
`dokumentasi/billing/prasyarat-kasir-spec.md` §5.7 (BR-D1C-01..06), §7.5.2, §8.3.

Validasi dasar (semua endpoint terproteksi):

* User telah login
* User aktif

Guard permission (`PermissionGuard`, dijalankan setelah `SessionGuard`):

* Setiap handler wajib `@RequirePermission('identity.*')`. Tanpa deklarasi → 403.
* Pengecualian: `@Public()` (login, `/health`), `/auth/*` milik diri sendiri
  (`me`, `session`, `logout`), `/sessions` milik diri sendiri, dan proxy downstream
  (permission ditegakkan di service tujuan, BR-D1B-09).
* Permission dihitung ulang dari resolver konteks aktif (`ActiveContextService`) di setiap request.
* Tanpa permission → **403** `{ success:false, message:"Anda tidak memiliki izin untuk aksi ini", error:"ForbiddenException", ... }`.

Pemetaan endpoint → permission:

| Endpoint | Permission |
| -------- | ---------- |
| `GET /tenants`, `GET /tenants/:id` | `identity.tenant.read` |
| `POST /tenants`, `PUT /tenants/:id` | `identity.tenant.create` / `identity.tenant.update` (hanya role platform, BR-D1C-04) |
| `GET /branches`, `GET /branches/:id` | `identity.branch.read` |
| `POST /branches`, `PUT /branches/:id` | `identity.branch.create` / `identity.branch.update` |
| `GET /users`, `GET /users/:id` | `identity.user.read` |
| `POST /users` | `identity.user.create` |
| `PUT /users/:id`, `PATCH /users/:id/status` | `identity.user.update` |
| `POST /users/:id/unlock` | `identity.user.unlock` |
| `GET /admin/sessions` / `DELETE /admin/sessions/:id` | `identity.session.read` / `identity.session.revoke` |
| `GET /admin/login-history` | `identity.login_history.read` |

Scope tenant (BR-D1C-02/03/05):

* Aktor tanpa role `PLATFORM` dibatasi ke tenant aktif; `SUPER_ADMIN` tidak dibatasi dan boleh memakai filter `tenantId`
  (`GET /branches`, `GET /admin/login-history`).
* Data di luar scope → **404** (tenant, cabang, user, session). Filter `tenantId` milik tenant lain pada
  `GET /branches` dan `GET /admin/login-history` oleh aktor non-platform diabaikan (hasil tetap tenant aktor).
* `POST /users` dan `POST /branches` dengan `tenantId` tenant lain oleh aktor non-platform → **403**.
* `PATCH /users/:id/status` dengan `inactive` pada diri sendiri → **422** (BR-D1C-06).
* KP-33: aktor yang bukan `OWNER`/platform (mis. `ADMIN`) tidak boleh mengubah status atau `unlock` user yang memegang
  `OWNER`/`ADMIN`/`SUPER_ADMIN` → **403**. Menonaktifkan `OWNER` aktif terakhir sebuah tenant → **409**.
* KP-22 (BR-D1D-10): `OWNER` yang membuat cabang lewat `POST /branches` otomatis mendapat `user_branch` (non-primary)
  dan `user_role` `OWNER` di cabang itu dalam transaksi yang sama.

---

# HTTP Status Code

Standar status code:

* 200 OK
* 201 Created
* 204 No Content
* 400 Bad Request
* 401 Unauthorized
* 403 Forbidden
* 404 Not Found
* 409 Conflict
* 422 Unprocessable Entity
* 500 Internal Server Error

---

# API Versioning

Seluruh endpoint menggunakan prefix:

```text
/api/v1
```

Contoh:

```text
POST /api/v1/auth/login

GET /api/v1/users

POST /api/v1/tenants

GET /api/v1/branches
```

---

# Future Expansion

Phase 2

* Role API
* Permission API
* Menu API
* User Role API

Phase 3

* OAuth API
* MFA API
* API Key API
* Audit API
* Notification API

---

# Conclusion

API Specification menjadi kontrak resmi antara Backend dan Frontend.

Seluruh endpoint harus mengikuti standar yang telah ditetapkan pada dokumen ini sehingga implementasi tetap konsisten, mudah dipelihara, dan siap dikembangkan pada phase berikutnya.
