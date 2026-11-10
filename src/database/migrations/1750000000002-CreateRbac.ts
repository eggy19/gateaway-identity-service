import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RBAC schema (T-13, spec prasyarat-kasir-spec.md D1-a): tables `permission`, `role`,
 * `role_permission`, `user_role`, plus seed of the permission catalog, system roles,
 * role matrix (dokumentasi/rbac/role-dan-permission.md §7), and backfill of `user_role`.
 *
 * The seed data below is a frozen snapshot of the matrix at the time of this migration.
 * Later changes (BR-D1A-12) must be new migrations, not edits to this file.
 */

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
/** Demo/platform seed account created by SeedFixedIds1750000000001. */
const SEED_USER_ID = 'cccccccc-0000-0000-0000-000000000001';

type PermissionSeed = readonly [code: string, description: string, isPlatform?: true];

export const RBAC_PERMISSIONS: readonly PermissionSeed[] = [
  // identity.* (endpoint milik Gateway)
  ['identity.tenant.read', 'Melihat data tenant'],
  ['identity.tenant.create', 'Membuat tenant', true],
  ['identity.tenant.update', 'Mengubah tenant', true],
  ['identity.branch.read', 'Melihat cabang'],
  ['identity.branch.create', 'Membuat cabang'],
  ['identity.branch.update', 'Mengubah cabang'],
  ['identity.user.read', 'Melihat user'],
  ['identity.user.create', 'Membuat user'],
  ['identity.user.update', 'Mengubah profil dan mengaktifkan/menonaktifkan user'],
  ['identity.user.unlock', 'Membuka kunci akun user'],
  ['identity.role.read', 'Melihat daftar role dan permission'],
  ['identity.user_role.read', 'Melihat role milik user'],
  ['identity.user_role.assign', 'Memberi role ke user'],
  ['identity.user_role.revoke', 'Mencabut role dari user'],
  ['identity.session.read', 'Melihat sesi aktif user lain'],
  ['identity.session.revoke', 'Memaksa logout sesi user lain'],
  ['identity.login_history.read', 'Melihat riwayat login'],
  // inventory.*
  ['inventory.master_data.read', 'Melihat kategori, satuan, tipe item, dan golongan obat'],
  ['inventory.master_data.manage', 'Mengelola kategori, satuan, tipe item, dan golongan obat'],
  ['inventory.item.read', 'Melihat item termasuk harga beli dan margin'],
  ['inventory.item.create', 'Menambah item'],
  ['inventory.item.update', 'Mengubah item, satuan, supplier item, dan status aktif'],
  ['inventory.item.delete', 'Menghapus item'],
  ['inventory.item_price.manage', 'Mengubah harga jual item'],
  ['inventory.supplier.read', 'Melihat supplier'],
  ['inventory.supplier.manage', 'Mengelola supplier'],
  ['inventory.margin_setting.read', 'Melihat pengaturan margin'],
  ['inventory.margin_setting.update', 'Mengubah pengaturan margin'],
  ['inventory.purchase_order.read', 'Melihat purchase order'],
  ['inventory.purchase_order.create', 'Membuat dan mengubah purchase order draft'],
  ['inventory.purchase_order.submit', 'Mengajukan purchase order'],
  ['inventory.purchase_order.approve', 'Menyetujui purchase order'],
  ['inventory.purchase_order.reject', 'Menolak purchase order'],
  ['inventory.purchase_order.cancel', 'Membatalkan purchase order'],
  ['inventory.goods_receipt.read', 'Melihat penerimaan barang'],
  ['inventory.goods_receipt.create', 'Membuat penerimaan barang'],
  ['inventory.goods_receipt.verify', 'Memverifikasi penerimaan barang (stok masuk)'],
  ['inventory.goods_receipt.delete', 'Menghapus penerimaan barang draft'],
  ['inventory.stock.read', 'Melihat stok, batch, dan mutasi stok'],
  ['inventory.stock.adjust', 'Melakukan penyesuaian stok manual'],
  ['inventory.stock_opname.read', 'Melihat stock opname'],
  ['inventory.stock_opname.create', 'Membuat stock opname'],
  ['inventory.stock_opname.finalize', 'Memfinalisasi stock opname'],
  ['inventory.dispensing.read', 'Melihat dispensing'],
  ['inventory.dispensing.create', 'Membuat dispensing'],
  ['inventory.pos_item.read', 'Mencari obat di layar kasir (harga jual dan stok tersedia)'],
  // billing.* (MVP kasir)
  ['billing.shift.open', 'Membuka shift kasir'],
  ['billing.shift.close', 'Menutup shift kasir milik sendiri'],
  ['billing.shift.read', 'Melihat shift kasir milik sendiri'],
  ['billing.shift.read_all', 'Melihat semua shift kasir di cabang'],
  ['billing.sale.create', 'Membuat penjualan dan menerima pembayaran tunai'],
  ['billing.sale.read', 'Melihat dan mencetak ulang struk penjualan milik sendiri'],
  ['billing.sale.read_all', 'Melihat semua penjualan di cabang'],
];

type RoleSeed = {
  code: string;
  name: string;
  description: string;
  scope: 'PLATFORM' | 'BRANCH';
};

export const RBAC_ROLES: readonly RoleSeed[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Admin Platform',
    description: 'Operator platform SaaS, lintas tenant',
    scope: 'PLATFORM',
  },
  { code: 'OWNER', name: 'Pemilik', description: 'Pemilik usaha di cabangnya', scope: 'BRANCH' },
  {
    code: 'ADMIN',
    name: 'Administrator',
    description: 'Staf administrasi: user, cabang, dan data master',
    scope: 'BRANCH',
  },
  {
    code: 'APOTEKER',
    name: 'Apoteker',
    description: 'Operasional kefarmasian dan pengawasan penjualan',
    scope: 'BRANCH',
  },
  { code: 'KASIR', name: 'Kasir', description: 'Pelayanan penjualan tunai', scope: 'BRANCH' },
];

const ALL_CODES = RBAC_PERMISSIONS.map(([code]) => code);
const IDENTITY_ALL = ALL_CODES.filter((code) => code.startsWith('identity.'));
const IDENTITY_NON_PLATFORM = IDENTITY_ALL.filter(
  (code) => code !== 'identity.tenant.create' && code !== 'identity.tenant.update',
);
const ALL_INVENTORY = ALL_CODES.filter((code) => code.startsWith('inventory.'));
const ALL_BILLING = ALL_CODES.filter((code) => code.startsWith('billing.'));

/** Role matrix (dokumen role §7.1–§7.6). Key = role code, value = permission codes. */
export const RBAC_ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  SUPER_ADMIN: IDENTITY_ALL,
  OWNER: [...IDENTITY_NON_PLATFORM, ...ALL_INVENTORY, ...ALL_BILLING],
  ADMIN: [
    ...IDENTITY_NON_PLATFORM,
    'inventory.master_data.read',
    'inventory.master_data.manage',
    'inventory.item.read',
    'inventory.item.create',
    'inventory.item.update',
    'inventory.item.delete',
    'inventory.supplier.read',
    'inventory.supplier.manage',
    'inventory.margin_setting.read',
    'inventory.stock.read',
  ],
  APOTEKER: [...ALL_INVENTORY, 'billing.shift.read_all', 'billing.sale.read_all'],
  KASIR: [
    'inventory.pos_item.read',
    'billing.shift.open',
    'billing.shift.close',
    'billing.shift.read',
    'billing.sale.create',
    'billing.sale.read',
  ],
};

const AUDIT_COLUMNS = `
        "created_at" timestamptz not null default now(),
        "created_by" uuid,
        "updated_at" timestamptz not null default now(),
        "updated_by" uuid,
        "deleted_at" timestamptz,
        "deleted_by" uuid`;

export class CreateRbac1750000000002 implements MigrationInterface {
  name = 'CreateRbac1750000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── permission ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      create table "permission" (
        "id" uuid not null default gen_random_uuid(),
        "code" varchar(100) not null,
        "service" varchar(30) not null,
        "resource" varchar(50) not null,
        "action" varchar(30) not null,
        "description" varchar(255) not null,
        "is_platform" boolean not null default false,${AUDIT_COLUMNS},
        constraint "pk_permission" primary key ("id")
      )
    `);
    await queryRunner.query(
      `create unique index "uq_permission_code" on "permission" ("code") where "deleted_at" is null`,
    );
    await queryRunner.query(`create index "idx_permission_service" on "permission" ("service")`);

    // ── role ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      create table "role" (
        "id" uuid not null default gen_random_uuid(),
        "tenant_id" uuid,
        "code" varchar(50) not null,
        "name" varchar(100) not null,
        "description" varchar(255),
        "scope" varchar(20) not null,
        "is_system" boolean not null default false,
        "status" varchar(20) not null default 'active',${AUDIT_COLUMNS},
        constraint "pk_role" primary key ("id"),
        constraint "fk_role_tenant" foreign key ("tenant_id") references "tenant" ("id") on delete restrict,
        constraint "chk_role_scope" check ("scope" in ('PLATFORM', 'BRANCH')),
        constraint "chk_role_status" check ("status" in ('active', 'inactive'))
      )
    `);
    await queryRunner.query(
      `create unique index "uq_role_tenant_code" on "role" (coalesce("tenant_id", '${NIL_UUID}'::uuid), "code") where "deleted_at" is null`,
    );
    await queryRunner.query(`create index "idx_role_tenant_id" on "role" ("tenant_id")`);

    // ── role_permission ─────────────────────────────────────────────────────
    await queryRunner.query(`
      create table "role_permission" (
        "id" uuid not null default gen_random_uuid(),
        "role_id" uuid not null,
        "permission_id" uuid not null,${AUDIT_COLUMNS},
        constraint "pk_role_permission" primary key ("id"),
        constraint "fk_role_permission_role" foreign key ("role_id") references "role" ("id") on delete restrict,
        constraint "fk_role_permission_permission" foreign key ("permission_id") references "permission" ("id") on delete restrict
      )
    `);
    await queryRunner.query(
      `create unique index "uq_role_permission_role_permission" on "role_permission" ("role_id", "permission_id") where "deleted_at" is null`,
    );
    await queryRunner.query(
      `create index "idx_role_permission_permission_id" on "role_permission" ("permission_id")`,
    );

    // ── user_role ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      create table "user_role" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "role_id" uuid not null,
        "tenant_id" uuid,
        "branch_id" uuid,${AUDIT_COLUMNS},
        constraint "pk_user_role" primary key ("id"),
        constraint "fk_user_role_user" foreign key ("user_id") references "user" ("id") on delete cascade,
        constraint "fk_user_role_role" foreign key ("role_id") references "role" ("id") on delete restrict,
        constraint "fk_user_role_tenant" foreign key ("tenant_id") references "tenant" ("id") on delete restrict,
        constraint "fk_user_role_branch" foreign key ("branch_id") references "branch" ("id") on delete restrict,
        constraint "chk_user_role_tenant_branch" check (("tenant_id" is null) = ("branch_id" is null))
      )
    `);
    await queryRunner.query(
      `create unique index "uq_user_role_user_role_branch" on "user_role" ("user_id", "role_id", coalesce("branch_id", '${NIL_UUID}'::uuid)) where "deleted_at" is null`,
    );
    await queryRunner.query(
      `create index "idx_user_role_user_branch" on "user_role" ("user_id", "branch_id")`,
    );
    await queryRunner.query(`create index "idx_user_role_tenant_id" on "user_role" ("tenant_id")`);
    await queryRunner.query(
      `create index "idx_user_role_role_tenant" on "user_role" ("role_id", "tenant_id") where "deleted_at" is null`,
    );

    // ── Seed: permission catalog ────────────────────────────────────────────
    for (const [code, description, isPlatform] of RBAC_PERMISSIONS) {
      const [service, resource, action] = code.split('.');
      await queryRunner.query(
        `insert into "permission" ("code", "service", "resource", "action", "description", "is_platform", "created_by", "updated_by")
         values ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [code, service, resource, action, description, isPlatform === true, SYSTEM_ACTOR],
      );
    }

    // ── Seed: system roles ──────────────────────────────────────────────────
    for (const role of RBAC_ROLES) {
      await queryRunner.query(
        `insert into "role" ("tenant_id", "code", "name", "description", "scope", "is_system", "status", "created_by", "updated_by")
         values (null, $1, $2, $3, $4, true, 'active', $5, $5)`,
        [role.code, role.name, role.description, role.scope, SYSTEM_ACTOR],
      );
    }

    // ── Seed: role → permission matrix ──────────────────────────────────────
    for (const [roleCode, permissionCodes] of Object.entries(RBAC_ROLE_PERMISSIONS)) {
      await queryRunner.query(
        `insert into "role_permission" ("role_id", "permission_id", "created_by", "updated_by")
         select r."id", p."id", $3, $3
         from "role" r
         join "permission" p on p."code" = any($2::text[]) and p."deleted_at" is null
         where r."code" = $1 and r."tenant_id" is null and r."deleted_at" is null`,
        [roleCode, permissionCodes, SYSTEM_ACTOR],
      );
    }

    // ── Backfill (KP-10, BR-D1A-10): OWNER on every active user_branch (active user, branch, tenant) ──────
    await queryRunner.query(
      `insert into "user_role" ("user_id", "role_id", "tenant_id", "branch_id", "created_by", "updated_by")
       select ub."user_id", r."id", b."tenant_id", ub."branch_id", $1, $1
       from "user_branch" ub
       join "user" u on u."id" = ub."user_id" and coalesce(u."status", 'active') = 'active'
       join "branch" b on b."id" = ub."branch_id" and b."deleted_at" is null and b."status" = 'active'
       join "tenant" t on t."id" = b."tenant_id" and t."deleted_at" is null and t."status" = 'active'
       join "role" r on r."code" = 'OWNER' and r."tenant_id" is null and r."deleted_at" is null
       where ub."deleted_at" is null`,
      [SYSTEM_ACTOR],
    );

    // Seed platform account additionally becomes SUPER_ADMIN (tenant/branch NULL).
    await queryRunner.query(
      `insert into "user_role" ("user_id", "role_id", "tenant_id", "branch_id", "created_by", "updated_by")
       select u."id", r."id", null, null, $1, $1
       from "user" u
       join "role" r on r."code" = 'SUPER_ADMIN' and r."tenant_id" is null and r."deleted_at" is null
       where u."id" = $2`,
      [SYSTEM_ACTOR, SEED_USER_ID],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists "user_role"`);
    await queryRunner.query(`drop table if exists "role_permission"`);
    await queryRunner.query(`drop table if exists "role"`);
    await queryRunner.query(`drop table if exists "permission"`);
  }
}
