import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T-19 (KP-35): `fk_user_branch_user` CASCADE -> RESTRICT, same reasoning as
 * `fk_user_role_user` in T-16a: a hard delete of a user must not silently drop the user's
 * branch assignments. Users are deactivated through `PATCH /users/:id/status`.
 */
export class UserBranchUserRestrict1750000000004 implements MigrationInterface {
  name = 'UserBranchUserRestrict1750000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table "user_branch" drop constraint "fk_user_branch_user"`);
    await queryRunner.query(
      `alter table "user_branch" add constraint "fk_user_branch_user" foreign key ("user_id") references "user" ("id") on delete restrict`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table "user_branch" drop constraint "fk_user_branch_user"`);
    await queryRunner.query(
      `alter table "user_branch" add constraint "fk_user_branch_user" foreign key ("user_id") references "user" ("id") on delete cascade`,
    );
  }
}
