# AI Architecture Rules

Project: Gateway & Identity Service
Version: 1.0
Status: LOCKED

---

# 1. Purpose

This document defines the architecture rules for the project.

AI must follow these rules when designing features, generating code, or reviewing existing code.

---

# 2. Architecture Style

Follow:

* Modular Monolith
* Domain Driven Design (Lightweight)
* Clean Architecture
* SOLID Principles

Do not redesign the architecture unless explicitly requested.

---

# 3. Module Ownership

Each module owns:

* Controller
* Service
* Repository
* Entity
* DTO
* Business Rules

Do not access another module's internal implementation directly.

Interact only through the module's public service.

---

# 4. Single Responsibility

Each module has one responsibility.

Examples:

* Authentication → Login & Session
* User → User Management
* Tenant → Tenant Management
* Branch → Branch Management
* Role → Role Management
* Permission → Permission Management

Do not mix business domains.

---

# 5. Database Ownership

Each module owns its own tables.

Rules:

* Read your own tables.
* Write only to your own tables.
* Avoid cross-module database access.

Use services instead of direct repository access across modules.

---

# 6. Dependency Rules

Allowed:

Controller
→ Service
→ Repository
→ Database

Not Allowed:

Repository → Controller

Service → Controller

Controller → Repository

Repository → Repository (different module)

Avoid circular dependencies.

---

# 7. Business Logic

Business logic belongs only in the Service layer.

Never place business logic inside:

* Controller
* DTO
* Entity
* Repository

---

# 8. API Rules

Use REST API.

Follow consistent endpoint naming.

Always:

* Validate input
* Return consistent responses
* Handle errors properly

---

# 9. Security Rules

Always:

* Authenticate first
* Authorize before executing business logic
* Validate user permissions
* Use secure cookies
* Never expose sensitive information

---

# 10. AI Rules

Always:

* Preserve existing architecture.
* Reuse existing modules.
* Keep the solution simple.
* Follow project coding standards.

Never:

* Introduce unnecessary frameworks.
* Create duplicate modules.
* Mix unrelated responsibilities.
* Redesign the system without approval.

If requirements are unclear, ask before making assumptions.

---

# 11. Architecture Goal

Every new feature should be:

* Simple
* Modular
* Secure
* Easy to maintain
* Easy to test
* Easy to extend

Consistency is more important than cleverness.
