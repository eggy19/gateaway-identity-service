# AI Coding Standards

Project: Gateway & Identity Service
Version: 1.0
Status: LOCKED

---

# 1. Purpose

This document defines the coding standards that every AI-generated code must follow.

The goal is to produce code that is:

* Consistent
* Readable
* Maintainable
* Testable
* Enterprise Ready

AI must always follow these standards unless explicitly instructed otherwise.

---

# 2. General Principles

Always prioritize:

1. Readability
2. Maintainability
3. Simplicity
4. Consistency

Avoid:

* Over Engineering
* Clever Code
* Premature Optimization
* Magic Numbers
* Duplicate Code

---

# 3. Language Standards

Language

* TypeScript

Configuration

* strict = true

Never use

* any
* var

Prefer

* const
* readonly
* enum
* interface
* type (when appropriate)

---

# 4. Project Architecture

Follow Modular Architecture.

```
src/

modules/

shared/

config/

database/

common/
```

Each module owns its own:

* Controller
* Service
* DTO
* Entity
* Repository
* Mapper
* Validator
* Constants

Never mix responsibilities between modules.

---

# 5. Layer Responsibilities

Controller

Responsible for:

* HTTP Request
* HTTP Response
* Validation
* Authentication Decorator

Never:

* Query Database
* Business Logic

---

Service

Responsible for:

* Business Logic
* Transaction
* Validation
* Calling Repository

Never:

* Handle HTTP
* Build SQL

---

Repository

Responsible for:

* Database Access

Never:

* Business Logic

---

DTO

Responsible for:

* API Contract
* Validation
* Swagger Documentation

Never:

* Business Logic

---

Entity

Responsible for:

* Database Mapping

Never:

* API Response Model

---

Mapper

Responsible for:

* Entity → Response DTO
* DTO → Entity

---

# 6. Naming Convention

Files

```
create-user.dto.ts

update-user.dto.ts

user.service.ts

user.controller.ts

user.repository.ts

user.entity.ts
```

Classes

```
CreateUserDto

UserService

UserRepository

UserEntity
```

Methods

```
findById()

findByEmail()

create()

update()

delete()

restore()
```

Variables

```
camelCase
```

Constants

```
UPPER_SNAKE_CASE
```

Enums

```
PascalCase
```

Database

```
snake_case
```

---

# 7. Folder Structure

Example

```
user/

controllers/

services/

repositories/

entities/

dto/

responses/

mappers/

validators/

constants/

interfaces/

enums/

types/

tests/
```

Do not place all files in one folder.

---

# 8. DTO Standards

Separate DTOs.

```
CreateUserDto

UpdateUserDto

SearchUserDto

UserResponseDto
```

Never reuse one DTO for multiple operations.

---

# 9. Validation Rules

Always validate using:

class-validator

Example

* IsString
* IsUUID
* IsEmail
* IsBoolean
* IsOptional
* MaxLength
* MinLength

Never trust client input.

---

# 10. Error Handling

Always throw:

```
BadRequestException

UnauthorizedException

ForbiddenException

NotFoundException

ConflictException
```

Never throw generic Error.

All errors must have meaningful messages.

---

# 11. Logging

Use Logger Service.

Log only:

* Error
* Warning
* Important Business Events

Never log:

* Password
* Cookie
* Token
* Session Secret
* Sensitive Personal Data

---

# 12. Database Standards

Primary Key

```
UUID
```

Audit Columns

```
created_at

created_by

updated_at

updated_by

deleted_at

deleted_by
```

Soft Delete

Always enabled.

Never hard delete transactional data.

---

# 13. Repository Rules

Repository methods should be simple.

Example

```
findById()

findByEmail()

exists()

save()

update()

delete()

restore()
```

Avoid writing complex business logic.

---

# 14. Transaction Rules

Business operations affecting multiple tables must use transactions.

Never update multiple entities independently without transaction support.

---

# 15. API Response Standard

Success Response

```
{
  success,
  message,
  data
}
```

Error Response

```
{
  success,
  message,
  error,
  timestamp,
  path
}
```

Never expose stack traces.

---

# 16. Authentication Rules

Authentication

* Better Auth

Session

* Cookie

Never implement custom authentication without approval.

Never store passwords in plain text.

Always hash passwords using Argon2.

---

# 17. Security Rules

Always

* Validate Input
* Sanitize Data
* Escape Query
* Use Parameterized Query
* Enable CSRF Protection
* Enable CORS
* Use Secure Cookie

Never

* Build SQL using string concatenation
* Trust Request Body
* Return Internal Error Details

---

# 18. TypeORM Rules

Always

* Repository Pattern
* Relation Decorators
* Lazy loading only when necessary

Avoid

* Raw SQL unless necessary
* QueryBuilder for simple CRUD

---

# 19. Controller Rules

Controllers should be thin.

Maximum responsibility:

* Receive Request
* Validate DTO
* Call Service
* Return Response

No business logic inside controller.

---

# 20. Service Rules

Service contains:

* Business Rules
* Domain Logic

Service should not know HTTP implementation.

---

# 21. Code Style

Maximum function length

50 lines (recommended)

Maximum class length

300 lines (recommended)

Maximum nesting

3 levels

Extract helper methods when necessary.

---

# 22. Comments

Write comments only when explaining:

* Business Rules
* Complex Logic
* Non-obvious Decisions

Do not comment obvious code.

---

# 23. Unit Testing

Framework

* Jest

Minimum tests

* Service
* Repository
* Utility

Focus on business logic rather than framework behavior.

---

# 24. AI Instructions

When generating code:

Always

* Reuse existing modules.
* Keep functions small.
* Keep classes cohesive.
* Prefer composition over duplication.
* Follow SOLID principles.
* Follow Clean Code practices.

Never

* Rewrite existing architecture.
* Introduce new frameworks.
* Create duplicate utilities.
* Mix controller and service responsibilities.
* Skip validation.
* Skip error handling.

If existing code conflicts with these standards:

Do not silently change it.

Explain the conflict first, then propose a safe refactoring strategy.

---

# 25. Definition of Good Code

Good code is:

* Easy to read
* Easy to test
* Easy to maintain
* Easy to extend
* Predictable
* Secure
* Consistent

Every AI-generated code should feel as if it was written by the same experienced backend engineer.
