import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 schema — all 9 tables in a single migration.
 *
 * Better Auth tables (`user`, `session`, `account`, `verification`) use the exact
 * DDL produced by Better Auth's own migration generator (UUID primary keys via
 * `gen_random_uuid()`, camelCase columns per the library's built-in structure —
 * DB-spec §11). The 5 custom tables follow project standards: snake_case columns,
 * UUID PKs, audit columns and soft delete.
 */
export class InitPhase1750000000000 implements MigrationInterface {
  name = 'InitPhase1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Better Auth tables (generated DDL) ──────────────────────────────────
    await queryRunner.query(
      `create table "user" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "status" text)`,
    );
    await queryRunner.query(
      `create table "session" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" uuid not null references "user" ("id") on delete cascade)`,
    );
    await queryRunner.query(
      `create table "account" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "accountId" text not null, "providerId" text not null, "userId" uuid not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null)`,
    );
    await queryRunner.query(
      `create table "verification" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null)`,
    );
    await queryRunner.query(`create index "user_status_idx" on "user" ("status")`);
    await queryRunner.query(`create index "session_userId_idx" on "session" ("userId")`);
    await queryRunner.query(`create index "session_expiresAt_idx" on "session" ("expiresAt")`);
    await queryRunner.query(`create index "account_userId_idx" on "account" ("userId")`);
    await queryRunner.query(
      `create index "verification_identifier_idx" on "verification" ("identifier")`,
    );

    // ── Custom tables (snake_case, audit + soft delete) ─────────────────────
    await queryRunner.query(`
      create table "tenant" (
        "id" uuid not null default gen_random_uuid(),
        "name" varchar(150) not null,
        "code" varchar(50) not null,
        "status" varchar(20) not null default 'active',
        "created_at" timestamptz not null default now(),
        "created_by" uuid,
        "updated_at" timestamptz not null default now(),
        "updated_by" uuid,
        "deleted_at" timestamptz,
        "deleted_by" uuid,
        constraint "pk_tenant" primary key ("id")
      )
    `);
    await queryRunner.query(`create unique index "uq_tenant_code" on "tenant" ("code")`);

    await queryRunner.query(`
      create table "branch" (
        "id" uuid not null default gen_random_uuid(),
        "tenant_id" uuid not null,
        "name" varchar(150) not null,
        "code" varchar(50) not null,
        "status" varchar(20) not null default 'active',
        "created_at" timestamptz not null default now(),
        "created_by" uuid,
        "updated_at" timestamptz not null default now(),
        "updated_by" uuid,
        "deleted_at" timestamptz,
        "deleted_by" uuid,
        constraint "pk_branch" primary key ("id"),
        constraint "fk_branch_tenant" foreign key ("tenant_id") references "tenant" ("id") on delete restrict
      )
    `);
    await queryRunner.query(`create index "idx_branch_tenant_id" on "branch" ("tenant_id")`);
    await queryRunner.query(
      `create unique index "uq_branch_tenant_code" on "branch" ("tenant_id", "code")`,
    );

    await queryRunner.query(`
      create table "user_branch" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "branch_id" uuid not null,
        "is_primary" boolean not null default false,
        "created_at" timestamptz not null default now(),
        "created_by" uuid,
        "updated_at" timestamptz not null default now(),
        "updated_by" uuid,
        "deleted_at" timestamptz,
        "deleted_by" uuid,
        constraint "pk_user_branch" primary key ("id"),
        constraint "fk_user_branch_user" foreign key ("user_id") references "user" ("id") on delete cascade,
        constraint "fk_user_branch_branch" foreign key ("branch_id") references "branch" ("id") on delete restrict
      )
    `);
    await queryRunner.query(`create index "idx_user_branch_user_id" on "user_branch" ("user_id")`);
    await queryRunner.query(
      `create index "idx_user_branch_branch_id" on "user_branch" ("branch_id")`,
    );
    await queryRunner.query(
      `create unique index "uq_user_branch_user_branch" on "user_branch" ("user_id", "branch_id")`,
    );

    await queryRunner.query(`
      create table "user_security" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "failed_login_count" int not null default 0,
        "last_failed_login_at" timestamptz,
        "block_until" timestamptz,
        "lock_reason" varchar(255),
        "last_login_at" timestamptz,
        "last_login_ip" varchar(45),
        "last_login_device" varchar(255),
        "password_changed_at" timestamptz,
        "force_change_password" boolean not null default false,
        "created_at" timestamptz not null default now(),
        "created_by" uuid,
        "updated_at" timestamptz not null default now(),
        "updated_by" uuid,
        "deleted_at" timestamptz,
        "deleted_by" uuid,
        constraint "pk_user_security" primary key ("id"),
        constraint "fk_user_security_user" foreign key ("user_id") references "user" ("id") on delete cascade
      )
    `);
    await queryRunner.query(
      `create unique index "uq_user_security_user_id" on "user_security" ("user_id")`,
    );
    await queryRunner.query(
      `create index "idx_user_security_block_until" on "user_security" ("block_until")`,
    );

    await queryRunner.query(`
      create table "login_history" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid,
        "tenant_id" uuid,
        "branch_id" uuid,
        "ip_address" varchar(45),
        "user_agent" varchar(512),
        "login_result" varchar(30) not null,
        "failure_reason" varchar(255),
        "created_at" timestamptz not null default now(),
        "created_by" uuid,
        "updated_at" timestamptz not null default now(),
        "updated_by" uuid,
        "deleted_at" timestamptz,
        "deleted_by" uuid,
        constraint "pk_login_history" primary key ("id"),
        constraint "fk_login_history_user" foreign key ("user_id") references "user" ("id") on delete set null
      )
    `);
    await queryRunner.query(
      `create index "idx_login_history_user_created" on "login_history" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `create index "idx_login_history_tenant_branch" on "login_history" ("tenant_id", "branch_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Custom tables first (they reference the Better Auth `user` table).
    await queryRunner.query(`drop table if exists "login_history"`);
    await queryRunner.query(`drop table if exists "user_security"`);
    await queryRunner.query(`drop table if exists "user_branch"`);
    await queryRunner.query(`drop table if exists "branch"`);
    await queryRunner.query(`drop table if exists "tenant"`);
    // Better Auth tables.
    await queryRunner.query(`drop table if exists "verification"`);
    await queryRunner.query(`drop table if exists "account"`);
    await queryRunner.query(`drop table if exists "session"`);
    await queryRunner.query(`drop table if exists "user"`);
  }
}
