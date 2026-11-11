import { QueryRunner } from 'typeorm';
import { RbacTenantBranchIntegrity1750000000003 } from './migrations/1750000000003-RbacTenantBranchIntegrity';

describe('RbacTenantBranchIntegrity migration', () => {
  const run = async (method: 'up' | 'down', violations: unknown[] = []): Promise<string[]> => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve(sql.trim().startsWith('select') ? violations : []);
      }),
    } as unknown as QueryRunner;
    await new RbacTenantBranchIntegrity1750000000003()[method](queryRunner);
    return queries;
  };

  it('up checks existing data first, then adds unique + composite FK and RESTRICT user FK', async () => {
    const queries = await run('up');
    expect(queries).toHaveLength(6);
    expect(queries[0]).toContain('select ur."id" from "user_role" ur');
    expect(queries[0]).toContain('ur."tenant_id" is distinct from b."tenant_id"');
    expect(queries.slice(1)).toEqual([
      'alter table "branch" add constraint "uq_branch_id_tenant_id" unique ("id", "tenant_id")',
      'alter table "user_role" drop constraint "fk_user_role_branch"',
      'alter table "user_role" add constraint "fk_user_role_branch_tenant" foreign key ("branch_id", "tenant_id") references "branch" ("id", "tenant_id") match simple on delete restrict',
      'alter table "user_role" drop constraint "fk_user_role_user"',
      'alter table "user_role" add constraint "fk_user_role_user" foreign key ("user_id") references "user" ("id") on delete restrict',
    ]);
  });

  it('up aborts with a clear message and changes nothing when data violates the constraint', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve([{ id: 'x' }]);
      }),
    } as unknown as QueryRunner;
    await expect(new RbacTenantBranchIntegrity1750000000003().up(queryRunner)).rejects.toThrow(
      /1 user_role row\(s\) have a tenant_id different/,
    );
    expect(queries).toHaveLength(1);
  });

  it('down restores the previous constraints exactly', async () => {
    expect(await run('down')).toEqual([
      'alter table "user_role" drop constraint "fk_user_role_user"',
      'alter table "user_role" add constraint "fk_user_role_user" foreign key ("user_id") references "user" ("id") on delete cascade',
      'alter table "user_role" drop constraint "fk_user_role_branch_tenant"',
      'alter table "user_role" add constraint "fk_user_role_branch" foreign key ("branch_id") references "branch" ("id") on delete restrict',
      'alter table "branch" drop constraint "uq_branch_id_tenant_id"',
    ]);
  });
});
