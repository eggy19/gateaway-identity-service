# Identity Service Phase 1 (MVP)

Version: 1.0
Status: Approved
Scope: Gateway + Identity Service

---

# 1. Overview

Identity Service merupakan service pertama yang dibangun pada platform Healthcare SaaS.

Service ini bertanggung jawab terhadap:

* Authentication
* User Management
* Tenant Management
* Branch Management
* Session Management
* Login Security

Fokus Phase 1 adalah menghasilkan fondasi autentikasi yang stabil agar service lain (Inventory, Clinical, Billing) dapat menggunakan Identity Service sebagai pusat identitas.

RBAC (Role & Permission), Menu Management, MFA, Organization, Audit Trail, dan fitur lanjutan akan dikerjakan pada fase berikutnya.

---

# 2. Objectives

Phase 1 bertujuan menyediakan:

* Login menggunakan Email & Password
* Authentication berbasis Cookie Session
* Multi Tenant
* Multi Branch
* User Security
* Login History
* Session Management

---

# 3. Technology Stack

| Component      | Technology                   |
| -------------- | ---------------------------- |
| Runtime        | Node.js                      |
| Language       | TypeScript                   |
| Framework      | NestJS                       |
| Authentication | Better Auth                  |
| ORM            | TypeORM                      |
| Database       | PostgreSQL                   |
| Session        | Better Auth Session (Cookie) |

---

# 4. Authentication Strategy

Authentication menggunakan Cookie Session.

Client tidak menyimpan Bearer Token.

Flow:

```text
Browser
    │
    ▼
Login
    │
    ▼
Identity Service
    │
    ▼
Better Auth
    │
    ▼
Set HttpOnly Cookie
    │
    ▼
Authenticated
```

Keuntungan pendekatan ini:

* Lebih aman terhadap XSS
* Tidak perlu menyimpan access token di browser
* Session dapat dicabut kapan saja
* Mendukung login multi-device

---

# 5. Multi Tenant Architecture

Hierarchy sistem:

```text
Tenant
    │
    ├── Branch A
    ├── Branch B
    └── Branch C
```

Satu user dapat memiliki akses ke lebih dari satu branch sesuai kebutuhan bisnis.

---

# 6. Database Scope

## Better Auth Tables

Better Auth menyediakan empat tabel utama.

| Table        | Description                             |
| ------------ | --------------------------------------- |
| user         | Master User                             |
| account      | Authentication Account                  |
| session      | Active Session                          |
| verification | Email Verification, Password Reset, OTP |

---

## Custom Tables

Untuk memenuhi kebutuhan SaaS Healthcare ditambahkan lima tabel.

| Table         | Description               |
| ------------- | ------------------------- |
| tenant        | Organisasi / Perusahaan   |
| branch        | Cabang Tenant             |
| user_branch   | Relasi User dengan Branch |
| user_security | Informasi keamanan akun   |
| login_history | Riwayat login             |

---

# 7. Total Database

```text
Better Auth
-----------
user
account
session
verification

Custom
------
tenant
branch
user_branch
user_security
login_history
```

Total tabel Phase 1:

```text
9 Tables
```

---

# 8. User Security

Informasi keamanan akun tidak disimpan langsung pada tabel user.

Semua data keamanan ditempatkan pada tabel user_security.

Contoh field:

* failed_login_count
* last_failed_login_at
* block_until
* lock_reason
* last_login_at
* last_login_ip
* last_login_device
* password_changed_at
* force_change_password

Keuntungan:

* Entity user tetap sederhana.
* Security mudah dikembangkan.
* Mendukung MFA di masa depan.
* Mendukung Account Lockout Policy.

---

# 9. Login History

Seluruh aktivitas login dicatat.

Contoh informasi:

* Login Success
* Invalid Password
* Account Locked
* User Disabled
* Session Expired

Data yang disimpan:

* user_id
* tenant_id
* branch_id
* ip_address
* user_agent
* login_result
* failure_reason
* created_at

Login history digunakan untuk:

* Audit
* Monitoring
* Security Investigation
* Brute Force Detection

---

# 10. Session Management

Session dikelola oleh Better Auth.

Informasi session meliputi:

* Session ID
* User
* Expired Time
* Cookie
* Last Activity

Ke depannya session dapat dikembangkan menjadi:

* Logout Semua Device
* Device Management
* Trusted Device
* Concurrent Session Limit

Tanpa perubahan besar pada arsitektur.

---

# 11. Features Included

## Authentication

* Login
* Logout
* Session Validation
* Password Reset
* Email Verification

---

## User

* CRUD User
* Activate User
* Deactivate User

---

## Tenant

* CRUD Tenant

---

## Branch

* CRUD Branch
* Assign User ke Branch

---

## Security

* Failed Login Counter
* Temporary Account Lock
* Login History
* Last Login Information

---

# 12. Features Deferred

Fitur berikut tidak termasuk Phase 1.

* Role
* Permission
* RBAC
* Menu Management
* API Key
* MFA
* OAuth Login
* SSO
* Organization
* Audit Event Bus
* Device Trust
* WebAuthn / Passkey
* Social Login

Semua fitur tersebut akan dikembangkan pada Phase 2 dan seterusnya.

---

# 13. Roadmap

## Phase 1

* Authentication
* User
* Tenant
* Branch
* Session
* Login Security

Total: 9 Tables

---

## Phase 2

* Role
* Permission
* User Role
* Role Permission
* Menu
* Role Menu

Estimasi tambahan: 6 Tables

---

## Phase 3

* MFA
* Device Management
* API Key
* OAuth
* Passkey
* Audit Event
* Notification

---

# 14. Design Principles

Seluruh pengembangan Identity Service mengikuti prinsip berikut:

* Domain Driven Design (DDD)
* Modular Architecture
* Multi Tenant First
* Cookie-Based Authentication
* Stateless API dengan Session Validation
* Separation of Authentication dan Business Domain
* Extendable tanpa perubahan besar pada struktur database

---

# 15. Conclusion

Identity Service Phase 1 menyediakan fondasi autentikasi yang sederhana namun siap berkembang.

Dengan hanya sembilan tabel, sistem sudah mampu mendukung:

* Multi Tenant
* Multi Branch
* Cookie Authentication
* Session Management
* Login Security
* Audit Login

Pendekatan ini memungkinkan pengembangan fitur lanjutan seperti RBAC, MFA, OAuth, dan Device Management tanpa perlu melakukan redesign database secara besar-besaran.
