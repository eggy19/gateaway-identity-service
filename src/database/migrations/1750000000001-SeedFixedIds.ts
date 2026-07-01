import { MigrationInterface, QueryRunner } from 'typeorm';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const TENANT_ID    = 'aaaaaaaa-0000-0000-0000-000000000001';
const BRANCH_ID    = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_ID      = 'cccccccc-0000-0000-0000-000000000001';
const ACCOUNT_ID   = 'dddddddd-0000-0000-0000-000000000001';

// Argon2id hash for "Password123!"
const PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$+gbxWz3QwOXU9t6T6ZRiGQ$HZ5bRF+HF7bwd0Y5m2SL4V+lcjE5a6Rual7Fz5T45Cc';

export class SeedFixedIds1750000000001 implements MigrationInterface {
  name = 'SeedFixedIds1750000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Tenant ────────────────────────────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "tenant" (id, name, code, status, created_by, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID, 'Demo Clinic', 'CLINIC-FIXED-001', 'active', SYSTEM_ACTOR],
    );

    // ── Branch ────────────────────────────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "branch" (id, tenant_id, name, code, status, created_by, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [BRANCH_ID, TENANT_ID, 'Main Branch', 'MAIN', 'active', SYSTEM_ACTOR],
    );

    // ── User (Better Auth table) ──────────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [USER_ID, 'Dummy User', 'dummy@clinic.test', true, 'active'],
    );

    // ── Account / credential (Better Auth table) ──────────────────────────
    await queryRunner.query(
      `INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ACCOUNT_ID, 'dummy@clinic.test', 'credential', USER_ID, PASSWORD_HASH],
    );

    // ── User security ─────────────────────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "user_security" (id, user_id, failed_login_count, created_by, updated_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 0, $2, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [USER_ID, SYSTEM_ACTOR],
    );

    // ── User branch assignment ─────────────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "user_branch" (id, user_id, branch_id, is_primary, created_by, updated_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, true, $3, $3, NOW(), NOW())
       ON CONFLICT (user_id, branch_id) DO NOTHING`,
      [USER_ID, BRANCH_ID, SYSTEM_ACTOR],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "user_branch"    WHERE user_id = $1`, [USER_ID]);
    await queryRunner.query(`DELETE FROM "user_security"  WHERE user_id = $1`, [USER_ID]);
    await queryRunner.query(`DELETE FROM "account"        WHERE id = $1`,      [ACCOUNT_ID]);
    await queryRunner.query(`DELETE FROM "user"           WHERE id = $1`,      [USER_ID]);
    await queryRunner.query(`DELETE FROM "branch"         WHERE id = $1`,      [BRANCH_ID]);
    await queryRunner.query(`DELETE FROM "tenant"         WHERE id = $1`,      [TENANT_ID]);
  }
}
