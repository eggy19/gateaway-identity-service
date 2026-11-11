import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T-16a (KP-28 / GAP-1, GAP-7):
 * - `user_role` must agree with the tenant that owns its branch: unique `(id, tenant_id)` on
 *   `branch` + composite FK `user_role(branch_id, tenant_id) -> branch(id, tenant_id)`.
 *   MATCH SIMPLE: platform rows (tenant/branch NULL) skip the check; the existing CHECK
 *   `chk_user_role_tenant_branch` guarantees both are NULL or both are set, so the composite FK
 *   fully covers the single-column `fk_user_role_branch`, which is dropped as redundant.
 * - `fk_user_role_user` CASCADE -> RESTRICT: role history must survive (BR-D1A-09).
 */
export class RbacTenantBranchIntegrity1750000000003 implements MigrationInterface {
  name = 'RbacTenantBranchIntegrity1750000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fail loudly (never delete data) if existing rows would violate the new constraint.
    const violations: unknown[] = await queryRunner.query(
      `select ur."id" from "user_role" ur
       join "branch" b on b."id" = ur."branch_id"
       where ur."tenant_id" is distinct from b."tenant_id"`,
    );
    if (violations.length > 0) {
      throw new Error(
        `Cannot add fk_user_role_branch_tenant: ${violations.length} user_role row(s) have a tenant_id different from the tenant of their branch. Fix the data manually, then re-run.`,
      );
    }

    await queryRunner.query(
      `alter table "branch" add constraint "uq_branch_id_tenant_id" unique ("id", "tenant_id")`,
    );
    await queryRunner.query(`alter table "user_role" drop constraint "fk_user_role_branch"`);
    await queryRunner.query(
      `alter table "user_role" add constraint "fk_user_role_branch_tenant" foreign key ("branch_id", "tenant_id") references "branch" ("id", "tenant_id") match simple on delete restrict`,
    );

    await queryRunner.query(`alter table "user_role" drop constraint "fk_user_role_user"`);
    await queryRunner.query(
      `alter table "user_role" add constraint "fk_user_role_user" foreign key ("user_id") references "user" ("id") on delete restrict`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table "user_role" drop constraint "fk_user_role_user"`);
    await queryRunner.query(
      `alter table "user_role" add constraint "fk_user_role_user" foreign key ("user_id") references "user" ("id") on delete cascade`,
    );

    await queryRunner.query(`alter table "user_role" drop constraint "fk_user_role_branch_tenant"`);
    await queryRunner.query(
      `alter table "user_role" add constraint "fk_user_role_branch" foreign key ("branch_id") references "branch" ("id") on delete restrict`,
    );
    await queryRunner.query(`alter table "branch" drop constraint "uq_branch_id_tenant_id"`);
  }
}
