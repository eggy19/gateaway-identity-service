# Frontend Authentication Guide

Version: 1.0  
Status: Ready  
Audience: Frontend Developer / Web Application Consumer

---

## 1. Overview

Gateway + Identity Service menggunakan **cookie-based session authentication** —
bukan Bearer token / JWT di header `Authorization`.

Mekanisme ini berarti:
- Browser menyimpan session cookie secara otomatis setelah login
- Setiap request berikutnya mengirim cookie tersebut secara otomatis
- Frontend **tidak perlu** menyimpan token di `localStorage` atau variabel apapun
- Cookie bersifat `HttpOnly` — tidak bisa dibaca JavaScript, aman dari XSS

---

## 2. Setup Awal

### 2.1 Base URL

```
Development : http://localhost:3000
```

Semua endpoint diawali dengan `/api/v1`.

### 2.2 CORS — Wajib untuk SPA

Jika frontend berjalan di port berbeda (Vite, CRA, Next.js dev server), minta
tim backend menambahkan origin frontend ke konfigurasi gateway:

```env
# .env di gateway
CORS_ORIGIN=http://localhost:5173
```

### 2.3 `credentials: 'include'` — Wajib di Semua Request

Tanpa ini browser tidak akan mengirim atau menyimpan cookie session.

```javascript
// BENAR
fetch('/api/v1/auth/me', { credentials: 'include' })

// SALAH — akan selalu 401
fetch('/api/v1/auth/me')
```

Jika menggunakan Axios, tambahkan sekali di instance:

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
  withCredentials: true, // setara dengan credentials: 'include'
});
```

---

## 3. Response Shape

Semua endpoint membungkus response dalam envelope yang sama:

```json
// Sukses
{
  "success": true,
  "message": "Login successful",
  "data": { ... }
}

// Error
{
  "success": false,
  "message": "Invalid credentials",
  "error": "UnauthorizedException",
  "timestamp": "2026-06-29T10:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

---

## 4. Login

### Endpoint

```
POST /api/v1/auth/login
Content-Type: application/json
```

### Request Body

```json
{
  "email": "dummy@clinic.test",
  "password": "Password123!"
}
```

### Response Sukses (`200 OK`)

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "id": "cccccccc-0000-0000-0000-000000000001",
    "name": "Dummy User",
    "email": "dummy@clinic.test",
    "emailVerified": true,
    "status": "active",
    "branchIds": ["bbbbbbbb-0000-0000-0000-000000000001"],
    "createdAt": "2026-06-29T00:00:00.000Z",
    "updatedAt": "2026-06-29T00:00:00.000Z",
    "context": {
      "tenantId": "aaaaaaaa-0000-0000-0000-000000000001",
      "tenantName": "Demo Clinic",
      "tenantCode": "CLINIC-FIXED-001",
      "branchId": "bbbbbbbb-0000-0000-0000-000000000001",
      "branchName": "Main Branch",
      "branchCode": "MAIN",
      "status": "active"
    },
    "roles": ["OWNER", "SUPER_ADMIN"],
    "permissions": ["billing.sale.create", "identity.branch.read", "inventory.item.read"],
    "branches": [
      { "branchId": "bbbbbbbb-0000-0000-0000-000000000001", "branchName": "Main Branch", "isPrimary": true }
    ]
  }
}
```

Bentuk `data` login **sama** dengan `GET /auth/me` (lihat bagian 5). Field `context`,
`roles`, `permissions`, `branches` bersifat aditif; field lama tidak berubah.

Browser otomatis menerima dan menyimpan cookie:

```
Set-Cookie: better-auth.session=<token>; Path=/; HttpOnly; SameSite=Lax
```

### Contoh — Fetch

```javascript
const response = await fetch('http://localhost:3000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    email: 'dummy@clinic.test',
    password: 'Password123!',
  }),
});

const result = await response.json();

if (!result.success) {
  // Tampilkan pesan error ke user
  console.error(result.message);
} else {
  // Cookie tersimpan otomatis — redirect ke halaman utama
  window.location.href = '/dashboard';
}
```

### Contoh — Axios

```javascript
try {
  const { data } = await api.post('/auth/login', {
    email: 'dummy@clinic.test',
    password: 'Password123!',
  });
  // data.data berisi user object
  console.log('Logged in as:', data.data.name);
} catch (error) {
  console.error('Login failed:', error.response?.data?.message);
}
```

### Contoh — cURL

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dummy@clinic.test","password":"Password123!"}' \
  -c cookies.txt \
  -s | jq .
```

### Contoh — HTTP File (VS Code REST Client / JetBrains)

```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "dummy@clinic.test",
  "password": "Password123!"
}
```

### Error Login

| HTTP Status | Penyebab | Solusi |
|-------------|----------|--------|
| `401 Unauthorized` | Email atau password salah | Tampilkan "Email atau password tidak valid" |
| `403 Forbidden` | Akun dinonaktifkan | "Akun Anda tidak aktif, hubungi administrator" |
| `403 Forbidden` | Akun terkunci (terlalu banyak percobaan gagal) | "Akun terkunci sementara, coba lagi nanti" |
| `422 Unprocessable Entity` | Format email tidak valid / password kosong | Validasi form sebelum submit |

---

## 5. Cek Status Login — `GET /auth/me`

Gunakan endpoint ini untuk:
- Mengecek apakah user sedang login saat halaman dimuat
- Mengambil data profil user yang sedang aktif

### Endpoint

```
GET /api/v1/auth/me
```

### Response Sukses (`200 OK`)

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": "cccccccc-0000-0000-0000-000000000001",
    "name": "Dummy User",
    "email": "dummy@clinic.test",
    "emailVerified": true,
    "status": "active",
    "branchIds": ["bbbbbbbb-0000-0000-0000-000000000001"],
    "createdAt": "2026-06-29T00:00:00.000Z",
    "updatedAt": "2026-06-29T00:00:00.000Z",
    "context": {
      "tenantId": "aaaaaaaa-0000-0000-0000-000000000001",
      "tenantName": "Demo Clinic",
      "tenantCode": "CLINIC-FIXED-001",
      "branchId": "bbbbbbbb-0000-0000-0000-000000000001",
      "branchName": "Main Branch",
      "branchCode": "MAIN",
      "status": "active"
    },
    "roles": ["OWNER", "SUPER_ADMIN"],
    "permissions": ["billing.sale.create", "identity.branch.read", "inventory.item.read"],
    "branches": [
      { "branchId": "bbbbbbbb-0000-0000-0000-000000000001", "branchName": "Main Branch", "isPrimary": true }
    ]
  }
}
```

Keterangan field konteks:

- `context`: tenant dan cabang aktif (cabang primary). `null` bila user belum punya assignment cabang.
- `context.status`: `active` | `tenant_inactive` | `branch_inactive`. Selain `active`, request ke
  service lain lewat proxy ditolak `403` ("Tenant atau cabang tidak aktif"); login dan `/auth/me` tetap berhasil.
- `roles`: kode role efektif user (termasuk role `PLATFORM` seperti `SUPER_ADMIN`), terurut.
- `permissions`: semua permission efektif (semua service, termasuk `identity.*`), tanpa duplikat, terurut.
  Pakai untuk menampilkan/menyembunyikan menu dan tombol; penegakan akses tetap di backend.
- `branches`: cabang yang di-assign ke user (informatif; belum ada pergantian cabang, KP-01).
- Role/permission dimuat ulang di setiap request, jadi perubahan role terlihat pada pemanggilan `/auth/me` berikutnya tanpa logout.

### Response Error (`401 Unauthorized`) — belum login / session expired

```json
{
  "success": false,
  "message": "Unauthorized",
  "error": "UnauthorizedException"
}
```

### Contoh — Cek saat app pertama dimuat

```javascript
async function checkAuth() {
  const response = await fetch('http://localhost:3000/api/v1/auth/me', {
    credentials: 'include',
  });

  if (response.status === 401) {
    // Belum login atau session expired
    window.location.href = '/login';
    return null;
  }

  const result = await response.json();
  return result.data; // user object
}

// Panggil di entry point app
const currentUser = await checkAuth();
if (currentUser) {
  renderApp(currentUser);
}
```

---

## 6. Info Session Saat Ini — `GET /auth/session`

Mengembalikan detail session yang sedang aktif (bukan profil user).

### Endpoint

```
GET /api/v1/auth/session
```

### Response Sukses (`200 OK`)

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": "session-uuid",
    "userId": "cccccccc-0000-0000-0000-000000000001",
    "expiresAt": "2026-07-06T10:00:00.000Z",
    "ipAddress": "127.0.0.1",
    "userAgent": "Mozilla/5.0 ...",
    "createdAt": "2026-06-29T10:00:00.000Z",
    "current": true
  }
}
```

---

## 7. Logout — `POST /auth/logout`

Menginvalidasi session dan menghapus cookie.

### Endpoint

```
POST /api/v1/auth/logout
```

### Response Sukses (`200 OK`)

```json
{
  "success": true,
  "message": "Logout successful",
  "data": null
}
```

### Contoh — Fetch

```javascript
await fetch('http://localhost:3000/api/v1/auth/logout', {
  method: 'POST',
  credentials: 'include',
});

// Redirect ke halaman login
window.location.href = '/login';
```

### Contoh — cURL

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -b cookies.txt \
  -c cookies.txt \
  -s | jq .
```

Setelah logout, semua request dengan cookie lama akan mendapat `401 Unauthorized`.

---

## 8. Manajemen Session Aktif

Fitur ini berguna untuk menampilkan "Sesi aktif di perangkat lain" dan memungkinkan
user logout dari perangkat tertentu.

### 8.1 Daftar Semua Session Aktif — `GET /sessions`

```
GET /api/v1/sessions
```

**Response (`200 OK`):**

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": "session-uuid-1",
      "userId": "cccccccc-0000-0000-0000-000000000001",
      "expiresAt": "2026-07-06T10:00:00.000Z",
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0 (Windows NT ...)",
      "createdAt": "2026-06-29T08:00:00.000Z",
      "current": true
    },
    {
      "id": "session-uuid-2",
      "userId": "cccccccc-0000-0000-0000-000000000001",
      "expiresAt": "2026-07-05T09:00:00.000Z",
      "ipAddress": "192.168.1.10",
      "userAgent": "Mozilla/5.0 (iPhone ...)",
      "createdAt": "2026-06-28T09:00:00.000Z",
      "current": false
    }
  ]
}
```

Field `current: true` menandai session yang sedang dipakai user sekarang.

### 8.2 Cabut Session Tertentu — `DELETE /sessions/:id`

```
DELETE /api/v1/sessions/{session-id}
```

**Response (`200 OK`):**

```json
{
  "success": true,
  "message": "Session revoked",
  "data": { "revoked": true }
}
```

### Contoh — Tampilkan dan cabut session lain

```javascript
// Ambil semua session
const res = await fetch('http://localhost:3000/api/v1/sessions', {
  credentials: 'include',
});
const { data: sessions } = (await res.json()).data;

// Cabut session yang bukan session saat ini
for (const session of sessions) {
  if (!session.current) {
    await fetch(`http://localhost:3000/api/v1/sessions/${session.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  }
}
```

---

## 9. Cabut Session Spesifik via Auth — `DELETE /auth/session/:id`

Sama dengan `DELETE /sessions/:id`, namun melalui path `/auth/`:

```
DELETE /api/v1/auth/session/{session-id}
```

**Response:**
```json
{ "success": true, "message": "Session revoked", "data": { "revoked": true } }
```

---

## 10. Integrasi Axios — Interceptor untuk Handle 401

Pattern ini menangani session expired secara otomatis di seluruh aplikasi:

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
  withCredentials: true,
});

// Response interceptor — handle session expired
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Session expired atau belum login
      // Simpan URL yang dituju agar bisa redirect kembali setelah login
      sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
```

**Penggunaan:**

```javascript
import api from './api';

// Login
const { data } = await api.post('/auth/login', { email, password });

// Cek profil (auto-redirect ke /login jika 401)
const { data: profile } = await api.get('/auth/me');

// Logout
await api.post('/auth/logout');
```

---

## 11. Integrasi Fetch — Wrapper Sederhana

Alternatif tanpa library tambahan:

```javascript
const GATEWAY = 'http://localhost:3000/api/v1';

async function apiFetch(path, options = {}) {
  const response = await fetch(`${GATEWAY}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    window.location.href = '/login';
    return null;
  }

  return response.json();
}

// Contoh penggunaan
const profile = await apiFetch('/auth/me');

const result = await apiFetch('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});

await apiFetch('/auth/logout', { method: 'POST' });
```

---

## 12. Contoh Integrasi Portal — Vue 3 + Pinia (klinik-frontend-vue)

Section ini mendokumentasikan pola integrasi **yang sudah dipakai di
production** oleh portal `klinik-frontend-vue` (Vue 3 + Pinia + Axios +
Vue Router). Tim portal bisa mencontoh langsung pola berikut untuk
memastikan login berhasil dan bisa mengambil info user yang sedang login.

### 12.1 Axios Client — `src/api/client.ts`

`withCredentials: true` wajib (setara `credentials: 'include'` di fetch).
Tambahkan juga flag custom `skipAuthRedirect` agar interceptor 401 global
(lihat 12.4) tidak "menyerobot" endpoint yang sudah menangani 401-nya
sendiri, seperti saat login atau cek sesi awal (`/auth/me` bootstrap).

```typescript
import axios from 'axios';

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipAuthRedirect?: boolean;
  }
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
      const [{ useAuthStore }, { default: router }] = await Promise.all([
        import('@/modules/auth/stores/auth.store'),
        import('@/router'),
      ]);
      useAuthStore().clearSession();

      const current = router.currentRoute.value;
      if (current.path !== '/login') {
        sessionStorage.setItem('redirectAfterLogin', current.fullPath);
        router.push('/login');
      }
    }
    return Promise.reject(error);
  },
);
```

### 12.2 Tipe Data — `src/modules/auth/types/auth.ts`

Selaras dengan response shape di section 3/4/5:

```typescript
export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  status: string;
  branchIds?: string[];
  createdAt: string;
  updatedAt: string;
  context: {
    tenantId: string;
    tenantName: string;
    tenantCode: string;
    branchId: string;
    branchName: string;
    branchCode: string;
    status: 'active' | 'tenant_inactive' | 'branch_inactive';
  } | null;
  roles: string[];
  permissions: string[];
  branches: { branchId: string; branchName: string; isPrimary: boolean }[];
}

export interface LoginPayload {
  email: string;
  password: string;
}
```

### 12.3 API Layer — `src/modules/auth/api/auth.api.ts`

Membungkus `apiClient` dan meng-unwrap `data.data` dari response envelope:

```typescript
import { apiClient } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import type { LoginPayload, User } from '../types/auth';

export const authApi = {
  async login(payload: LoginPayload): Promise<User> {
    const res = await apiClient.post<ApiResponse<User>>('/auth/login', payload, {
      skipAuthRedirect: true,
    });
    return res.data.data;
  },

  async me(): Promise<User> {
    const res = await apiClient.get<ApiResponse<User>>('/auth/me', {
      skipAuthRedirect: true,
    });
    return res.data.data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout', undefined, { skipAuthRedirect: true });
  },
};
```

### 12.4 Pinia Store — `src/modules/auth/stores/auth.store.ts`

Satu-satunya sumber kebenaran (source of truth) untuk info user yang sedang
login di seluruh aplikasi portal:

```typescript
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '../api/auth.api';
import type { LoginPayload, User } from '../types/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  // true setelah pengecekan /auth/me pertama (bootstrap) selesai — dipakai
  // router guard agar tidak memanggil /auth/me di setiap navigasi.
  const initialized = ref(false);

  const isAuthenticated = computed(() => user.value !== null);

  async function checkAuth() {
    try {
      user.value = await authApi.me();
    } catch {
      user.value = null;
    } finally {
      initialized.value = true;
    }
  }

  async function login(payload: LoginPayload) {
    const loggedInUser = await authApi.login(payload);
    user.value = loggedInUser;
    initialized.value = true;
    return loggedInUser;
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      user.value = null;
    }
  }

  // Dipakai interceptor 401 global — sinkron, tanpa panggilan API.
  function clearSession() {
    user.value = null;
  }

  return { user, initialized, isAuthenticated, checkAuth, login, logout, clearSession };
});
```

### 12.5 Router Guard — `src/router/index.ts`

Mengecek sesi sekali saat bootstrap app, lalu melindungi route yang bukan
`meta.public`:

```typescript
router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  if (!authStore.initialized) {
    await authStore.checkAuth();
  }

  const isPublic = to.meta.public === true;

  if (!isPublic && !authStore.isAuthenticated) {
    if (to.path !== '/login') {
      sessionStorage.setItem('redirectAfterLogin', to.fullPath);
    }
    return { path: '/login' };
  }

  if (to.path === '/login' && authStore.isAuthenticated) {
    return { path: '/' };
  }

  return true;
});
```

Route publik ditandai lewat meta, contoh halaman login:

```typescript
{
  path: '/login',
  name: 'login',
  component: () => import('@/modules/auth/views/LoginView.vue'),
  meta: { title: 'Masuk', public: true, layout: 'blank' },
}
```

### 12.6 Form Login — `LoginView.vue`

Submit memanggil `authStore.login()`, memetakan status HTTP ke pesan error
(konsisten dengan tabel error di section 4), lalu redirect ke halaman yang
dituju sebelum login (jika ada):

```typescript
async function onSubmit() {
  submitting.value = true;
  try {
    await authStore.login({ email: form.email, password: form.password });

    const redirectTo = sessionStorage.getItem('redirectAfterLogin');
    sessionStorage.removeItem('redirectAfterLogin');
    router.push(redirectTo || '/');
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    formError.value = messageForStatus(status, err.response?.data?.message);
  } finally {
    submitting.value = false;
  }
}

function messageForStatus(status?: number, backendMessage?: string): string {
  switch (status) {
    case 401:
      return 'Email atau password tidak valid.';
    case 403:
      return backendMessage || 'Akun Anda tidak aktif, hubungi administrator.';
    case 422:
      return backendMessage || 'Periksa kembali email dan password Anda.';
    case 429:
      return 'Terlalu banyak percobaan, coba lagi nanti.';
    case 503:
      return 'Layanan sedang mengalami gangguan. Coba lagi nanti.';
    default:
      return backendMessage || 'Login gagal. Silakan coba lagi.';
  }
}
```

### 12.7 Menampilkan Info User yang Login

Setelah `checkAuth()` (bootstrap) atau `login()` selesai, `authStore.user`
sudah reaktif berisi data user — komponen manapun cukup membaca dari store,
**tanpa fetch ulang**:

```vue
<script setup lang="ts">
import { useAuthStore } from '@/modules/auth/stores/auth.store';

const auth = useAuthStore();
</script>

<template>
  <span>{{ auth.user?.name }}</span>
  <span>{{ auth.user?.email }}</span>
</template>
```

### 12.8 Catatan Penting

- **`skipAuthRedirect` wajib** di request `login`, `me`, dan `logout` —
  tanpa ini, kegagalan `/auth/me` saat bootstrap (user belum login) akan
  memicu interceptor 401 global dan menyebabkan redirect loop.
- **`checkAuth()` hanya dipanggil sekali** per lifecycle app, dijaga oleh
  flag `initialized` di Pinia store — bukan di setiap navigasi, supaya tidak
  memanggil `/auth/me` berulang kali secara tidak perlu.
- **`user` di Pinia store adalah satu-satunya sumber info user yang login**
  — jangan duplikasi ke `localStorage`/`sessionStorage`/state lain (lihat
  juga section 15 — Tips Keamanan).

---

## 13. Referensi Semua Endpoint Auth

| Method | Path | Auth | Keterangan |
|--------|------|------|------------|
| `POST` | `/api/v1/auth/login` | Tidak | Login, set cookie session |
| `POST` | `/api/v1/auth/logout` | Ya | Logout, hapus cookie |
| `GET` | `/api/v1/auth/me` | Ya | Profil user yang sedang login |
| `GET` | `/api/v1/auth/session` | Ya | Detail session yang sedang aktif |
| `DELETE` | `/api/v1/auth/session/:id` | Ya | Cabut session tertentu |
| `GET` | `/api/v1/sessions` | Ya | Daftar semua session aktif user |
| `DELETE` | `/api/v1/sessions/:id` | Ya | Cabut session tertentu |

Kolom **Auth: Ya** berarti request harus menyertakan cookie session yang valid.
Jika tidak ada cookie atau cookie expired → `401 Unauthorized`.

---

## 14. Ringkasan Error yang Mungkin Muncul

| HTTP Status | Kondisi | Yang Harus Dilakukan Frontend |
|-------------|---------|-------------------------------|
| `401 Unauthorized` | Belum login / session expired | Redirect ke halaman login |
| `403 Forbidden` | Akun tidak aktif | Tampilkan pesan, jangan redirect login |
| `403 Forbidden` | Akun terkunci | Tampilkan pesan + waktu tunggu |
| `422 Unprocessable Entity` | Validasi gagal (email format, field kosong) | Tampilkan error per field dari `message` |
| `429 Too Many Requests` | Rate limit tercapai | Tampilkan "Terlalu banyak percobaan, coba lagi nanti" |
| `503 Service Unavailable` | Backend downstream mati | Tampilkan pesan gangguan layanan |

---

## 15. Tips Keamanan

**Jangan simpan session info di `localStorage`**  
Cookie `HttpOnly` tidak bisa dibaca JavaScript — ini adalah perlindungan dari XSS.
Jangan mencoba workaround dengan menyimpan token atau user ID di `localStorage`.

**Selalu gunakan `credentials: 'include'`**  
Ini satu-satunya cara browser mengirim dan menerima cookie lintas origin. Tanpa
ini semua request akan 401 meski sudah login.

**Session meluncur otomatis**  
Setiap request yang berhasil memperpanjang masa berlaku session. User yang aktif
tidak akan tiba-tiba di-logout.

**`X-Request-Id` untuk debug**  
Setiap response menyertakan header `X-Request-Id`. Sertakan nilai ini saat
melaporkan bug agar tim backend bisa trace log dengan cepat:

```javascript
const response = await fetch('/api/v1/auth/me', { credentials: 'include' });
const requestId = response.headers.get('x-request-id');
console.log('Request ID:', requestId); // kirim ke tim backend jika ada error
```
