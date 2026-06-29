# Implementation Guide

Version: 1.0
Module: Gateway + Identity Service
Phase: 1 (MVP)
Status: Draft

## Purpose

Dokumen ini menjadi panduan implementasi seluruh komponen pada Gateway + Identity Service.

Dokumen ini **tidak menjelaskan business logic**, tetapi mendefinisikan standar implementasi yang harus diikuti oleh seluruh developer maupun AI Coding Agent agar menghasilkan struktur kode yang konsisten.

---

## Scope

Phase 1 mencakup implementasi:

* Project Structure
* Folder Structure
* Module Structure
* Configuration
* Entity
* Repository
* Service
* Controller
* DTO
* Validation
* Authentication
* Authorization
* Middleware
* Guards
* Interceptors
* Exception Handling
* Logging
* Session Management

---

## Implementation Principles

Seluruh implementasi harus mengikuti prinsip berikut:

* Modular Architecture
* Domain Separation
* Single Responsibility Principle (SRP)
* Dependency Injection
* Repository Pattern
* Clean Code
* Consistent Naming Convention
* Reusable Components
* Testable Components

---

## Folder Structure

Menentukan struktur direktori project agar seluruh module memiliki pola yang konsisten.

---

## Module Structure

Setiap domain memiliki module sendiri.

Contoh:

* Auth Module
* User Module
* Tenant Module
* Branch Module
* Session Module

---

## Controller

Controller hanya bertanggung jawab menerima request dan mengembalikan response.

Controller **tidak boleh** berisi business logic.

---

## Service

Service berisi seluruh business logic aplikasi.

Service tidak boleh mengakses database secara langsung tanpa melalui Repository.

---

## Repository

Repository bertanggung jawab terhadap seluruh operasi database.

Seluruh query harus berada pada layer Repository.

---

## Entity

Entity mengikuti struktur database yang telah ditetapkan pada Database Specification.

Entity tidak boleh berisi business logic.

---

## DTO (Data Transfer Object)

Seluruh request dan response menggunakan DTO.

DTO digunakan untuk:

* Validation
* Type Safety
* API Documentation

---

## Validation

Seluruh input harus divalidasi sebelum diproses.

Validasi meliputi:

* Required Field
* Format
* Length
* Enum
* Business Validation

---

## Authentication

Authentication menggunakan Better Auth dengan Cookie Session.

Seluruh proses login, logout, dan validasi session mengikuti mekanisme Better Auth.

---

## Authorization

Phase 1 belum mengimplementasikan RBAC.

Authorization hanya melakukan validasi:

* User Login
* User Active
* Tenant Active
* Branch Active

---

## Middleware

Middleware digunakan untuk kebutuhan global seperti:

* Request Logging
* Correlation ID
* Request ID
* Cookie Parsing
* Tenant Resolution

---

## Guards

Guard digunakan untuk proteksi endpoint.

Phase 1 menggunakan:

* Authentication Guard
* Session Guard

Guard tambahan akan ditambahkan pada Phase 2.

---

## Interceptors

Interceptor digunakan untuk:

* Response Formatting
* Execution Time
* Logging
* Transform Response

---

## Exception Handling

Seluruh exception menggunakan Global Exception Filter.

Response error harus memiliki format yang konsisten.

---

## Logging

Logging harus mencatat:

* Request
* Response
* Error
* Authentication Event
* Security Event

---

## Session Management

Session menggunakan Better Auth Session.

Mendukung:

* Login
* Logout
* Session Validation
* Session Expiration

---

## Configuration

Seluruh konfigurasi aplikasi menggunakan Environment Variables.

Tidak diperbolehkan melakukan hardcode terhadap:

* Database Connection
* Secret Key
* Cookie Secret
* JWT Secret (Future)
* External API Key

---

## Coding Standards

Seluruh implementasi harus mengikuti dokumen:

* CLAUDE_STANDARD.md
* CLAUDE_ARCHITECTURE.md

---

## Out of Scope

Phase 1 belum mencakup:

* Role Management
* Permission Management
* Menu Management
* OAuth
* MFA
* Passkey
* API Key
* Device Trust
* Audit Event Bus

---

## Conclusion

Implementation Guide menjadi acuan utama dalam proses pengembangan Gateway + Identity Service.

Seluruh implementasi harus mengacu pada:

1. Architecture Document
2. Database Specification
3. Implementation Guide
4. API Specification
5. Business Flow

Dengan pendekatan ini, seluruh developer maupun AI Coding Agent akan menghasilkan implementasi yang konsisten, mudah dipelihara, dan siap dikembangkan pada phase berikutnya.
