import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed data DEV/UAT: tenant "Egsa Pharmacy Indonesia" dengan 3 cabang
 * (Egsa Simatupang = main/pusat, Egsa Juanda, Egsa Sudirman) dan satu akun per role
 * cabang (OWNER, ADMIN, APOTEKER, KASIR) di tiap cabang — 12 akun.
 *
 * Cabang aktif user = cabang primary (ActiveContextService), jadi setiap akun hanya punya
 * satu user_branch (primary) dan satu user_role di cabang tersebut.
 *
 * Password tidak disimpan di repo: hanya hash Argon2id (sama dengan auth-options.ts).
 * Daftar akun & password: dokumentasi/deployment/development/2.9.dev-seed-egsa-pharmacy.md.
 *
 * ID scheme (v4 valid): tenant e65a0001-…, branch e65a0002-…-00000000000{B},
 * user e65a0003-…-0000000000{B}{R}, account e65a0004-…-0000000000{B}{R}
 * (B = 1 Simatupang, 2 Juanda, 3 Sudirman; R = 1 OWNER, 2 ADMIN, 3 APOTEKER, 4 KASIR).
 */
const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const TENANT_ID = 'e65a0001-0000-4000-8000-000000000001';

const BRANCHES = [
  { n: 1, slug: 'simatupang', name: 'Egsa Simatupang', code: 'SMT' },
  { n: 2, slug: 'juanda', name: 'Egsa Juanda', code: 'JDA' },
  { n: 3, slug: 'sudirman', name: 'Egsa Sudirman', code: 'SDM' },
] as const;

/** Hash Argon2id (m=65536,t=3,p=4) per role; plaintext hanya di dokumen seed. */
const ROLES = [
  {
    n: 1,
    code: 'OWNER',
    label: 'Pemilik',
    hash: '$argon2id$v=19$m=65536,t=3,p=4$wYJiiK7PzL2sHVYW1p9vTQ$XWGSsZlzgl3GlgsG9tBdKWNkMKuCwoe0A0TpjpY2Gwc',
  },
  {
    n: 2,
    code: 'ADMIN',
    label: 'Admin',
    hash: '$argon2id$v=19$m=65536,t=3,p=4$21BdsOEVVSJNT3gawoCaww$7S3kWevb7DDLV897aTvHDI7bn7u3m2WQ+BvrYL+X0NY',
  },
  {
    n: 3,
    code: 'APOTEKER',
    label: 'Apoteker',
    hash: '$argon2id$v=19$m=65536,t=3,p=4$PEz3xYVDjamPVhM7yKy++w$D7ZfszoKXYvJ5VnmfGlSP7ciGlvovCAvL1naaCfvck8',
  },
  {
    n: 4,
    code: 'KASIR',
    label: 'Kasir',
    hash: '$argon2id$v=19$m=65536,t=3,p=4$KeU4N3gzMI+a+pEdw5/2IQ$HHp9tDazEDpQbVyvxMgTDRG2TZ9s4ZymjmW9LNM6th0',
  },
] as const;

const branchId = (b: number): string => `e65a0002-0000-4000-8000-00000000000${b}`;
const userId = (b: number, r: number): string => `e65a0003-0000-4000-8000-0000000000${b}${r}`;
const accountId = (b: number, r: number): string => `e65a0004-0000-4000-8000-0000000000${b}${r}`;

export class SeedEgsaPharmacy1750000000005 implements MigrationInterface {
  name = 'SeedEgsaPharmacy1750000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "tenant" (id, name, code, status, created_by, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $4, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID, 'Egsa Pharmacy Indonesia', 'EGSA', SYSTEM_ACTOR],
    );

    for (const branch of BRANCHES) {
      await queryRunner.query(
        `INSERT INTO "branch" (id, tenant_id, name, code, status, created_by, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', $5, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [branchId(branch.n), TENANT_ID, branch.name, branch.code, SYSTEM_ACTOR],
      );

      for (const role of ROLES) {
        const uid = userId(branch.n, role.n);
        const email = `${role.code.toLowerCase()}.${branch.slug}@egsa.test`;

        await queryRunner.query(
          `INSERT INTO "user" (id, name, email, "emailVerified", status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, true, 'active', NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [uid, `${role.label} ${branch.name}`, email],
        );
        await queryRunner.query(
          `INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
           VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [accountId(branch.n, role.n), uid, uid, role.hash],
        );
        await queryRunner.query(
          `INSERT INTO "user_security" (id, user_id, failed_login_count, created_by, updated_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 0, $2, $2, NOW(), NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [uid, SYSTEM_ACTOR],
        );
        await queryRunner.query(
          `INSERT INTO "user_branch" (id, user_id, branch_id, is_primary, created_by, updated_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, true, $3, $3, NOW(), NOW())
           ON CONFLICT (user_id, branch_id) DO NOTHING`,
          [uid, branchId(branch.n), SYSTEM_ACTOR],
        );
        await queryRunner.query(
          `INSERT INTO "user_role" ("user_id", "role_id", "tenant_id", "branch_id", "created_by", "updated_by")
           SELECT $1, r."id", $2, $3, $4, $4
           FROM "role" r
           WHERE r."code" = $5 AND r."tenant_id" IS NULL AND r."deleted_at" IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM "user_role" ur
               WHERE ur."user_id" = $1 AND ur."role_id" = r."id" AND ur."branch_id" = $3
                 AND ur."deleted_at" IS NULL
             )`,
          [uid, TENANT_ID, branchId(branch.n), SYSTEM_ACTOR, role.code],
        );
      }
    }
  }

  /** Hanya untuk revert di dev (data seed ini saja, dikenali dari ID tetap). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const userIds = BRANCHES.flatMap((b) => ROLES.map((r) => userId(b.n, r.n)));
    const branchIds = BRANCHES.map((b) => branchId(b.n));
    await queryRunner.query(`DELETE FROM "user_role" WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await queryRunner.query(`DELETE FROM "user_branch" WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await queryRunner.query(`DELETE FROM "user_security" WHERE user_id = ANY($1::uuid[])`, [
      userIds,
    ]);
    await queryRunner.query(`DELETE FROM "session" WHERE "userId" = ANY($1::uuid[])`, [userIds]);
    await queryRunner.query(`DELETE FROM "account" WHERE "userId" = ANY($1::uuid[])`, [userIds]);
    await queryRunner.query(`DELETE FROM "user" WHERE id = ANY($1::uuid[])`, [userIds]);
    await queryRunner.query(`DELETE FROM "branch" WHERE id = ANY($1::uuid[])`, [branchIds]);
    await queryRunner.query(`DELETE FROM "tenant" WHERE id = $1`, [TENANT_ID]);
  }
}
