# Database Specification

Version: 1.0
Module: Gateway + Identity Service
Phase: 1 (MVP)
Status: Approved

---

# 1. Overview

Dokumen ini menjelaskan spesifikasi database untuk Gateway + Identity Service pada Phase 1.

Database dirancang sebagai pondasi autentikasi dan manajemen identitas yang akan digunakan oleh seluruh service dalam Healthcare SaaS.

Scope Phase 1 meliputi:

* Authentication
* User Management
* Tenant Management
* Branch Management
* Session Management
* Login Security

---

# 2. Technology

| Item           | Value              |
| -------------- | ------------------ |
| Database       | PostgreSQL         |
| ORM            | TypeORM            |
| Authentication | Better Auth        |
| Primary Key    | UUID               |
| Timestamp      | UTC                |
| Soft Delete    | Custom Tables Only |

---

# 3. Database Architecture

Database terdiri dari dua kelompok tabel.

## Better Auth

Tabel yang dikelola oleh Better Auth.

| Table        | Description                   |
| ------------ | ----------------------------- |
| user         | Identitas pengguna            |
| account      | Authentication provider       |
| session      | Session Cookie                |
| verification | Verification & Password Reset |

## Custom Tables

Tabel yang dikembangkan untuk kebutuhan Healthcare SaaS.

| Table         | Description               |
| ------------- | ------------------------- |
| tenant        | Tenant / Organisasi       |
| branch        | Cabang Tenant             |
| user_branch   | Relasi User dengan Branch |
| user_security | Informasi keamanan akun   |
| login_history | Riwayat login             |

---

# 4. Entity Relationship Diagram

```text
                       tenant
                          │
                          │
                     ┌────┴────┐
                     │         │
                  branch      user
                     │         │
                     │         ├──────────────┐
                     │         │              │
               user_branch user_security login_history
                               │
                               │
                     Better Auth Tables
                ┌────────┼──────────┐
                │        │          │
            account   session   verification
```

---

# 5. Table Specification

## 5.1 user (Better Auth)

Purpose

Menyimpan identitas utama pengguna.

Ownership

Better Auth

Digunakan oleh:

* Authentication
* Session
* User Management

---

## 5.2 account (Better Auth)

Purpose

Menyimpan informasi provider autentikasi.

Contoh:

* Email Password
* Google OAuth (Future)
* Microsoft (Future)

Ownership

Better Auth

---

## 5.3 session (Better Auth)

Purpose

Menyimpan session login berbasis Cookie.

Digunakan untuk:

* Login
* Logout
* Session Validation
* Multi Device Login

---

## 5.4 verification (Better Auth)

Purpose

Menyimpan token verifikasi.

Digunakan untuk:

* Email Verification
* Password Reset
* OTP (Future)

---

## 5.5 tenant

Purpose

Menyimpan data organisasi yang menggunakan sistem.

Contoh:

* Klinik ABC
* Apotek Sehat

Relationship

Tenant memiliki banyak Branch.

---

## 5.6 branch

Purpose

Menyimpan cabang milik Tenant.

Relationship

* Banyak Branch dimiliki satu Tenant.
* Banyak User dapat ditempatkan pada satu Branch.

---

## 5.7 user_branch

Purpose

Mapping User ke Branch.

Digunakan karena:

* Satu User dapat mengakses beberapa Branch.
* Satu Branch memiliki banyak User.

Relationship

Many-to-Many.

---

## 5.8 user_security

Purpose

Menyimpan seluruh informasi keamanan akun.

Contoh informasi:

* failed_login_count
* last_failed_login_at
* block_until
* last_login_at
* password_changed_at

Alasan dipisahkan dari tabel user:

* Memisahkan domain identitas dan keamanan.
* Mudah dikembangkan.
* Mendukung MFA pada fase berikutnya.

---

## 5.9 login_history

Purpose

Audit seluruh aktivitas login.

Contoh:

* Login Success
* Invalid Password
* User Locked
* Session Expired

Data ini digunakan untuk:

* Audit
* Monitoring
* Investigasi
* Brute Force Detection

---

# 6. Relationship

| Parent | Child         | Type        |
| ------ | ------------- | ----------- |
| tenant | branch        | One-to-Many |
| user   | user_branch   | One-to-Many |
| branch | user_branch   | One-to-Many |
| user   | user_security | One-to-One  |
| user   | login_history | One-to-Many |
| user   | account       | One-to-Many |
| user   | session       | One-to-Many |

---

# 7. Database Rules

Semua Primary Key menggunakan UUID.

Semua Foreign Key menggunakan UUID.

Seluruh tabel menggunakan snake_case.

Seluruh timestamp menggunakan UTC.

Seluruh tabel custom menggunakan audit column.

Tidak menggunakan integer auto increment.

---

# 8. Audit Fields

Semua tabel custom menggunakan field berikut.

| Column     |
| ---------- |
| created_at |
| created_by |
| updated_at |
| updated_by |
| deleted_at |
| deleted_by |

Better Auth mengikuti struktur bawaan library.

---

# 9. Index Recommendation

Minimal index:

* email
* tenant_id
* branch_id
* session_token
* expires_at
* block_until
* created_at

Composite Index:

* tenant_id + branch_id
* user_id + branch_id
* user_id + created_at

---

# 10. Future Expansion

Phase 2

* role
* permission
* role_permission
* user_role
* menu
* role_menu

Phase 3

* audit_log
* api_key
* notification
* oauth_provider
* mfa_device
* trusted_device

Tanpa perubahan besar pada struktur database Phase 1.

---

# 11. Database Principles

Seluruh desain database mengikuti prinsip berikut:

* Single Responsibility per Table
* Separation of Authentication dan Business Domain
* Better Auth Compatibility
* Multi Tenant Ready
* Multi Branch Ready
* Extendable
* Tidak melakukan modifikasi pada tabel inti Better Auth kecuali melalui mekanisme yang didukung library.

---

# 12. Conclusion

Phase 1 menggunakan total 9 tabel:

Better Auth

* user
* account
* session
* verification

Custom

* tenant
* branch
* user_branch
* user_security
* login_history

Struktur ini sudah cukup untuk mendukung:

* Authentication
* Cookie Session
* Multi Tenant
* Multi Branch
* User Management
* Login Security

tanpa perlu melakukan redesign database saat memasuki Phase 2 maupun Phase 3.
