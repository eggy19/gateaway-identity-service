# Client Gateway Access Guide

Version: 1.0  
Status: Ready  
Audience: Frontend Developer / API Consumer

---

## 1. Overview

Gateway + Identity Service berfungsi sebagai **single entry point** untuk semua
request dari browser/client ke backend services (Inventory, Billing, Clinical, dll).

Client **tidak perlu** tahu alamat masing-masing backend service — cukup:
1. Login ke gateway → dapat **session cookie**
2. Pakai cookie tersebut untuk semua request ke downstream service

Gateway akan otomatis:
- Memvalidasi session
- Membangun identity context (user, tenant, branch)
- Meneruskan request ke service tujuan dengan header keamanan yang tepat

---

## 2. Prasyarat

| Kebutuhan | Detail |
|-----------|--------|
| Gateway URL | `http://localhost:3000` (development) |
| Akun user | Email + password yang sudah terdaftar |
| Status user | `active` |
| Branch assignment | User harus sudah di-assign ke minimal satu branch |
| Downstream service | Service tujuan harus berjalan dan URL-nya dikonfigurasi di `.env` gateway |

---

## 3. Step 1 — Login

Login untuk mendapatkan session cookie.

### Endpoint

```
POST /api/v1/auth/login
Content-Type: application/json
```

### Request Body

```json
{
  "email": "admin@clinic.test",
  "password": "Admin12345!"
}
```

### Response Sukses (`200 OK`)

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@clinic.test",
    "name": "Admin User",
    "sessionId": "sess-uuid"
  }
}
```

Response juga menyertakan header:
```
Set-Cookie: better-auth.session=<token>; Path=/; HttpOnly; SameSite=Lax
```

Cookie ini **wajib disimpan dan dikirim** pada setiap request berikutnya.

### Contoh — cURL

```bash
# Simpan cookie ke file cookies.txt
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clinic.test","password":"Admin12345!"}' \
  -c cookies.txt \
  -v
```

### Contoh — JavaScript (Fetch)

```javascript
const response = await fetch('http://localhost:3000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // wajib: agar browser menyimpan cookie
  body: JSON.stringify({
    email: 'admin@clinic.test',
    password: 'Admin12345!',
  }),
});

const result = await response.json();
console.log(result.data.userId); // cookie tersimpan otomatis oleh browser
```

### Contoh — HTTP File (VS Code / JetBrains)

```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@clinic.test",
  "password": "Admin12345!"
}
```

---

## 4. Step 2 — Akses Downstream Service

Setelah login, gunakan cookie session untuk mengakses downstream service
melalui gateway.

### Format URL

```
{METHOD} /api/v1/{service}/{path}?{query}
Cookie: better-auth.session=<token>
```

| Bagian | Contoh | Keterangan |
|--------|--------|------------|
| `{service}` | `inventory` | Nama service tujuan (lihat Routing Table §5) |
| `{path}` | `items/123` | Path di downstream service (tanpa prefix) |
| `{query}` | `?page=1&limit=10` | Query string diteruskan apa adanya |

### Contoh Request

#### GET — Ambil daftar item

```bash
# Gunakan cookies.txt dari step login
curl http://localhost:3000/api/v1/inventory/items?page=1 \
  -b cookies.txt
```

```javascript
const response = await fetch('http://localhost:3000/api/v1/inventory/items?page=1', {
  credentials: 'include', // kirim cookie
});
const data = await response.json();
```

```http
GET http://localhost:3000/api/v1/inventory/items?page=1
Cookie: better-auth.session=<token>
```

---

#### POST — Buat item baru

```bash
curl -X POST http://localhost:3000/api/v1/inventory/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Paracetamol","qty":100}' \
  -b cookies.txt
```

```javascript
const response = await fetch('http://localhost:3000/api/v1/inventory/items', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ name: 'Paracetamol', qty: 100 }),
});
```

---

#### PUT — Update item

```bash
curl -X PUT http://localhost:3000/api/v1/inventory/items/item-uuid \
  -H "Content-Type: application/json" \
  -d '{"qty":200}' \
  -b cookies.txt
```

---

#### DELETE — Hapus item

```bash
curl -X DELETE http://localhost:3000/api/v1/inventory/items/item-uuid \
  -b cookies.txt
```

---

## 5. Routing Table — Downstream Services

Gateway menentukan tujuan berdasarkan **prefix pertama** dari URL path.

| Prefix URL | Diteruskan ke | Env Var di Gateway | Contoh URL Client |
|------------|---------------|--------------------|-------------------|
| `inventory` | Inventory Service | `INVENTORY_SERVICE_URL` | `/api/v1/inventory/items` |
| `billing` | Billing Service | `BILLING_SERVICE_URL` | `/api/v1/billing/invoices` |
| `clinical` | Clinical Service | `CLINICAL_SERVICE_URL` | `/api/v1/clinical/records` |
| `notification` | Notification Service | `NOTIFICATION_SERVICE_URL` | `/api/v1/notification/send` |

**Transformasi URL oleh gateway:**

```
Client request:   GET /api/v1/inventory/items/123?page=1
                                ↓ strip /api/v1
Downstream:       GET {INVENTORY_SERVICE_URL}/inventory/items/123?page=1
```

---

## 6. Yang Terjadi di Balik Layar

Setiap request yang diterima gateway melalui proses berikut:

```
Browser / Client
│
│  GET /api/v1/inventory/items
│  Cookie: better-auth.session=abc123
│
▼
[1] RequestLogger Middleware
    → Generate X-Request-Id (nilai dari client hanya dipakai jika berformat UUID; selain itu dibuat baru)
│
▼
[2] Session Guard (otomatis, global)
    → Validasi cookie ke Better Auth
    → Jika tidak valid → 401 Unauthorized (berhenti di sini)
    → Jika valid → attach user + session ke request
│
▼
[3] Gateway Controller (@All ':service/*')
    → Ekstrak prefix: 'inventory'
│
▼
[4] Gateway Service
    → Cek routing table → target = INVENTORY_SERVICE_URL
    → Load user branch (tenantId + branchId) dari database
    → Sign Internal JWT (Ed25519, expiry 5 menit):
       { sub, tenantId, branchId, sessionId, requestId, aud: 'inventory-service' }
    → Tolak path bersegmen `internal` (404) dan dot-segment `.`/`..` termasuk yang di-encode (400)
    → Hapus header terlarang dari client: cookie, host, authorization, proxy-authorization,
      x-user-context, x-tenant-id, x-branch-id, x-user-id, content-length, dan hop-by-hop
      (connection, keep-alive, transfer-encoding, upgrade, te, trailer)
    → Tambah X-User-Context: <JWT>
    → Tambah X-Request-Id
│
▼
[5] HTTP Forward ke Downstream
    GET http://inventory-service:3001/items
    X-User-Context: eyJhbGciOiJFZERTQSJ9...
    X-Request-Id: 550e8400-...
    (tanpa Cookie!)
│
▼
[6] Inventory Service
    → Verify JWT dengan public key Ed25519
    → Baca tenantId + branchId dari JWT
    → Jalankan logic (filter data per tenant/branch)
    → Kembalikan response
│
▼
[7] Gateway → teruskan response balik ke Client
    Status code & body dari downstream diteruskan apa adanya
```

---

## 7. Error yang Mungkin Terjadi

### Error dari Gateway (sebelum sampai downstream)

| HTTP Status | Pesan | Penyebab | Solusi |
|-------------|-------|----------|--------|
| `401 Unauthorized` | Session not found | Cookie tidak ada atau expired | Login ulang (Step 1) |
| `403 Forbidden` | User is not active | Akun dinonaktifkan | Hubungi admin |
| `403 Forbidden` | User has no branch assignment | User belum di-assign ke branch | Hubungi admin |
| `404 Not Found` | Unknown downstream service | Prefix service tidak dikenali | Cek Routing Table §5 |
| `503 Service Unavailable` | Downstream not configured | `*_SERVICE_URL` belum diset di `.env` | Hubungi tim ops |
| `503 Service Unavailable` | Downstream is unavailable | Service tujuan mati / tidak bisa dijangkau | Cek status downstream service |

### Error dari Downstream (diteruskan apa adanya)

Jika downstream service mengembalikan `400`, `404`, `500`, dll — gateway meneruskan
status code dan body tersebut langsung ke client tanpa modifikasi.

---

## 8. Logout

Akhiri sesi untuk menginvalidasi cookie.

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -b cookies.txt \
  -c cookies.txt
```

```javascript
await fetch('http://localhost:3000/api/v1/auth/logout', {
  method: 'POST',
  credentials: 'include',
});
```

```http
POST http://localhost:3000/api/v1/auth/logout
Cookie: better-auth.session=<token>
```

Setelah logout, semua request dengan cookie lama akan mendapat `401 Unauthorized`.

---

## 9. Contoh Lengkap End-to-End

### cURL (cocok untuk testing manual)

```bash
# 1. Login dan simpan cookie
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clinic.test","password":"Admin12345!"}' \
  -c cookies.txt -s | jq .

# 2. Cek siapa yang login (opsional)
curl http://localhost:3000/api/v1/auth/me \
  -b cookies.txt -s | jq .

# 3. Akses Inventory Service lewat gateway
curl "http://localhost:3000/api/v1/inventory/items?page=1" \
  -b cookies.txt -s | jq .

# 4. Buat item baru
curl -X POST http://localhost:3000/api/v1/inventory/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Amoxicillin","qty":50,"unit":"tablet"}' \
  -b cookies.txt -s | jq .

# 5. Akses service lain (billing)
curl "http://localhost:3000/api/v1/billing/invoices" \
  -b cookies.txt -s | jq .

# 6. Logout
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -b cookies.txt -c cookies.txt -s | jq .
```

---

### JavaScript — SPA / React / Vue

```javascript
const GATEWAY = 'http://localhost:3000';

// Semua fetch harus menyertakan credentials: 'include'
const api = {
  async login(email, password) {
    const res = await fetch(`${GATEWAY}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  },

  async get(servicePath) {
    const res = await fetch(`${GATEWAY}/api/v1/${servicePath}`, {
      credentials: 'include',
    });
    if (res.status === 401) {
      // Session expired — redirect ke halaman login
      window.location.href = '/login';
      return;
    }
    return res.json();
  },

  async post(servicePath, body) {
    const res = await fetch(`${GATEWAY}/api/v1/${servicePath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async logout() {
    await fetch(`${GATEWAY}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  },
};

// Penggunaan
await api.login('admin@clinic.test', 'Admin12345!');
const items = await api.get('inventory/items?page=1');
const invoice = await api.post('billing/invoices', { patientId: 'p-1', total: 50000 });
await api.logout();
```

---

## 10. Tips & Catatan

**`credentials: 'include'` wajib di fetch**  
Tanpa ini browser tidak akan mengirim atau menyimpan cookie session. Ini adalah
sumber paling umum dari error 401 yang tidak terduga.

**Cookie bersifat HttpOnly**  
Cookie tidak bisa dibaca oleh JavaScript (`document.cookie`). Ini adalah fitur
keamanan — jangan mencoba workaround dengan menyimpan token di localStorage.

**Session otomatis diperbarui**  
Setiap request yang berhasil akan memperpanjang masa berlaku session (sliding
expiry). Pengguna yang aktif tidak akan di-logout tiba-tiba.

**CORS — pengaturan untuk development**  
Jika frontend berjalan di port berbeda (misal `:5173` untuk Vite), tambahkan ke
`CORS_ORIGIN` di `.env` gateway. Nilai ini menerima banyak origin sekaligus,
dipisahkan dengan koma:
```
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

**X-Request-Id untuk debugging**  
Setiap response dari gateway menyertakan header `X-Request-Id`. Gunakan nilai
ini saat melaporkan bug agar tim backend bisa trace log dengan mudah.
