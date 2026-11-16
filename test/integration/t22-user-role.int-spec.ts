// Better Auth ships ESM only; no session/login is exercised here.
jest.mock('better-auth', () => ({ betterAuth: () => ({ api: {}, handler: jest.fn() }) }));

import {
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { UserRoleAdminService } from '../../src/modules/identity-admin/services/user-role-admin.service';
import { UserRoleRepository } from '../../src/modules/role/repositories/user-role.repository';
import type { ActorScope } from '../../src/shared/auth/actor-scope';

/**
 * T-22 integration test (real SQL, local PostgreSQL): assign / revoke / list of user roles
 * (BR-D1D-01..13, AC-D1D-01..19). Random data, cleaned up in afterAll (asserted).
 */
describe('T-22 user role assignment - real SQL + PostgreSQL', () => {
  let app: INestApplication;
  let ds: DataSource;
  let svc: UserRoleAdminService;
  let userRoleRepo: UserRoleRepository;

  const tag = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];
  const branchIds: string[] = [];
  const userIds: string[] = [];
  const role: Record<string, string> = {};
  const platform: ActorScope = {
    userId: randomUUID(),
    tenantId: null,
    isPlatform: true,
    roles: ['SUPER_ADMIN'],
  };

  const q = <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => ds.query(sql, params);

  async function mkTenant(): Promise<{ tenantId: string; branchId: string; branch2Id: string }> {
    const [t] = await q(
      `insert into tenant (name, code, status) values ($1, $2, 'active') returning id`,
      [`T22 ${tag}`, `T22INT-${tag}-${tenantIds.length}`],
    );
    tenantIds.push(t.id);
    const mkBranch = async (): Promise<string> => {
      const [b] = await q(
        `insert into branch (tenant_id, name, code, status) values ($1, $2, $3, 'active') returning id`,
        [t.id, `T22 br ${branchIds.length}`, `B${branchIds.length}-${tag}`],
      );
      branchIds.push(b.id);
      return b.id;
    };
    return { tenantId: t.id, branchId: await mkBranch(), branch2Id: await mkBranch() };
  }
  async function mkUser(
    inBranches: string[],
    status: 'active' | 'inactive' = 'active',
  ): Promise<string> {
    const id = randomUUID();
    await q(
      `insert into "user" (id, name, email, "emailVerified", status) values ($1, 'T22 user', $2, true, $3)`,
      [id, `t22-int-${tag}-${userIds.length}@test.invalid`, status],
    );
    userIds.push(id);
    for (const branchId of inBranches) {
      await q(`insert into user_branch (user_id, branch_id, is_primary) values ($1, $2, true)`, [
        id,
        branchId,
      ]);
    }
    return id;
  }
  async function grant(
    userId: string,
    code: string,
    tenantId: string,
    branchId: string,
  ): Promise<string> {
    const [row] = await q(
      `insert into user_role (user_id, role_id, tenant_id, branch_id) values ($1, $2, $3, $4) returning id`,
      [userId, role[code], tenantId, branchId],
    );
    return row.id;
  }
  const actorOf = (userId: string, tenantId: string, roles: string[]): ActorScope => ({
    userId,
    tenantId,
    isPlatform: false,
    roles,
  });
  const liveRows = (userId: string, code: string) =>
    q(
      `select ur.* from user_role ur join role r on r.id = ur.role_id
       where ur.user_id = $1 and r.code = $2 and ur.deleted_at is null`,
      [userId, code],
    );

  beforeAll(async () => {
    for (const k of ['INVENTORY', 'BILLING', 'CLINICAL', 'NOTIFICATION']) {
      process.env[`${k}_SERVICE_URL`] ??= 'http://127.0.0.1:1';
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get<DataSource>(getDataSourceToken());
    svc = app.get(UserRoleAdminService);
    userRoleRepo = app.get(UserRoleRepository);

    for (const r of await q(
      `select id, code from role where tenant_id is null and deleted_at is null`,
    )) {
      role[r.code] = r.id;
    }
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        await q(`delete from user_role where user_id = any($1::uuid[])`, [userIds]);
        await q(`delete from user_branch where user_id = any($1::uuid[])`, [userIds]);
        await q(`delete from "user" where id = any($1::uuid[])`, [userIds]);
        await q(`delete from branch where id = any($1::uuid[])`, [branchIds]);
        await q(`delete from tenant where id = any($1::uuid[])`, [tenantIds]);
        // Leftovers of earlier crashed runs (test data only, identified by prefix).
        await q(
          `delete from user_role where user_id in (select id from "user" where email like 't22-int-%@test.invalid')`,
        );
        await q(
          `delete from user_branch where user_id in (select id from "user" where email like 't22-int-%@test.invalid')`,
        );
        await q(`delete from "user" where email like 't22-int-%@test.invalid'`);

        const left = await q(
          `select
           (select count(*) from user_role where user_id = any($1::uuid[]))::int as ur,
           (select count(*) from "user" where id = any($1::uuid[]) or email like 't22-int-%@test.invalid')::int as u,
           (select count(*) from branch where id = any($2::uuid[]))::int as b,
           (select count(*) from tenant where id = any($3::uuid[]))::int as t`,
          [userIds, branchIds, tenantIds],
        );
        expect(left[0]).toEqual({ ur: 0, u: 0, b: 0, t: 0 });
      }
    } finally {
      await app?.close();
    }
  });

  it('AC-D1D-01/07/12: ADMIN assigns KASIR; tenant comes from the branch; revoke only soft-deletes; re-assign adds a row', async () => {
    const { tenantId, branchId } = await mkTenant();
    const adminId = await mkUser([branchId]);
    await grant(adminId, 'ADMIN', tenantId, branchId);
    const k = await mkUser([branchId]);
    const admin = actorOf(adminId, tenantId, ['ADMIN']);

    const created = await svc.assign(k, { roleId: role.KASIR, branchId }, admin);
    const row = created.assignments[0];
    expect(row).toMatchObject({ userId: k, tenantId, branchId, createdBy: adminId });
    expect(created.branchNames.get(branchId)).toContain('T22 br');

    // BR-D1D-07: the next effective-grants read already carries the KASIR permissions.
    const grants = await userRoleRepo.findEffectiveGrants(k, tenantId, branchId);
    expect(grants.map((g) => g.roleCode)).toContain('KASIR');
    expect(grants.map((g) => g.permissionCode)).toContain('billing.sale.create');

    const before = (await q(`select * from user_role where id = $1`, [row.id]))[0];
    await svc.revoke(k, row.id, admin);
    const after = (await q(`select * from user_role where id = $1`, [row.id]))[0];
    for (const col of [
      'user_id',
      'role_id',
      'tenant_id',
      'branch_id',
      'created_at',
      'created_by',
    ]) {
      expect(after[col]).toEqual(before[col]);
    }
    expect(after.deleted_at).not.toBeNull();
    expect(after.deleted_by).toBe(adminId);
    expect(after.updated_by).toBe(adminId);

    // Revoking twice: the assignment is no longer live -> 404 (BR-D1D-11).
    await expect(svc.revoke(k, row.id, admin)).rejects.toBeInstanceOf(NotFoundException);

    const live = await svc.list(k, false, admin);
    expect(live.assignments).toHaveLength(0);
    await svc.assign(k, { roleId: role.APOTEKER, branchId }, admin);
    const history = await svc.list(k, true, admin);
    expect(history.assignments).toHaveLength(2);
    const revoked = history.assignments.find((a) => a.id === row.id);
    expect(revoked?.deletedBy).toBe(adminId);
    expect(revoked?.role.code).toBe('KASIR');
  });

  it('AC-D1D-05/19: duplicate is 409; two concurrent assigns give one row and one 409 (not 500)', async () => {
    const { tenantId, branchId } = await mkTenant();
    const ownerId = await mkUser([branchId]);
    await grant(ownerId, 'OWNER', tenantId, branchId);
    const owner = actorOf(ownerId, tenantId, ['OWNER']);
    const k = await mkUser([branchId]);

    await svc.assign(k, { roleId: role.KASIR, branchId }, owner);
    await expect(svc.assign(k, { roleId: role.KASIR, branchId }, owner)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const k2 = await mkUser([branchId]);
    const results = await Promise.allSettled([
      svc.assign(k2, { roleId: role.KASIR, branchId }, owner),
      svc.assign(k2, { roleId: role.KASIR, branchId }, owner),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(await liveRows(k2, 'KASIR')).toHaveLength(1);
  });

  it('AC-D1D-02/03/04/11/17: hierarchy 403, missing user_branch 422, foreign branch 404, SUPER_ADMIN invisible 404', async () => {
    const a = await mkTenant();
    const b = await mkTenant();
    const adminId = await mkUser([a.branchId, a.branch2Id]);
    await grant(adminId, 'ADMIN', a.tenantId, a.branchId);
    await grant(adminId, 'ADMIN', a.tenantId, a.branch2Id);
    const admin = actorOf(adminId, a.tenantId, ['ADMIN']);
    const k = await mkUser([a.branchId]);

    await expect(
      svc.assign(k, { roleId: role.OWNER, branchId: a.branchId }, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.assign(k, { roleId: role.ADMIN, branchId: a.branchId }, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.assign(k, { roleId: role.SUPER_ADMIN, branchId: null }, admin),
    ).rejects.toBeInstanceOf(NotFoundException);
    // K has no user_branch at branch2 -> 422; foreign tenant branch -> 404.
    await expect(
      svc.assign(k, { roleId: role.KASIR, branchId: a.branch2Id }, admin),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      svc.assign(k, { roleId: role.KASIR, branchId: b.branchId }, admin),
    ).rejects.toBeInstanceOf(NotFoundException);
    // BRANCH role without branch -> 422 (AC-D1D-10); self -> 403 (BR-D1D-08).
    await expect(
      svc.assign(k, { roleId: role.KASIR, branchId: null }, admin),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      svc.assign(adminId, { roleId: role.KASIR, branchId: a.branchId }, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await q(`select 1 from user_role where user_id = $1`, [k])).toHaveLength(0);

    // A soft-deleted user_branch does not count (AC-D1D-11).
    await q(
      `insert into user_branch (user_id, branch_id, is_primary, deleted_at) values ($1,$2,false,now())`,
      [k, a.branch2Id],
    );
    await expect(
      svc.assign(k, { roleId: role.KASIR, branchId: a.branch2Id }, admin),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    // Positive: once the user_branch is live, the same call succeeds.
    await q(`update user_branch set deleted_at = null where user_id = $1 and branch_id = $2`, [
      k,
      a.branch2Id,
    ]);
    await expect(
      svc.assign(k, { roleId: role.KASIR, branchId: a.branch2Id }, admin),
    ).resolves.toBeDefined();
  });

  it('BR-D1D-09: authority is judged at the target branch (ADMIN only at P cannot assign at Q)', async () => {
    const { tenantId, branchId, branch2Id } = await mkTenant();
    const adminId = await mkUser([branchId, branch2Id]);
    await grant(adminId, 'ADMIN', tenantId, branchId);
    const k = await mkUser([branch2Id]);

    await expect(
      svc.assign(
        k,
        { roleId: role.KASIR, branchId: branch2Id },
        actorOf(adminId, tenantId, ['ADMIN']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await q(`select 1 from user_role where user_id = $1`, [k])).toHaveLength(0);
  });

  it('AC-D1D-14/15/16: IDOR - other tenant user/assignment is 404 and nothing changes', async () => {
    const a = await mkTenant();
    const b = await mkTenant();
    const adminId = await mkUser([a.branchId]);
    await grant(adminId, 'ADMIN', a.tenantId, a.branchId);
    const admin = actorOf(adminId, a.tenantId, ['ADMIN']);
    const k = await mkUser([a.branchId]);
    const ak = await grant(k, 'KASIR', a.tenantId, a.branchId);
    const b1 = await mkUser([b.branchId]);
    const ab = await grant(b1, 'KASIR', b.tenantId, b.branchId);
    const k2 = await mkUser([a.branchId]);
    const ak2 = await grant(k2, 'KASIR', a.tenantId, a.branchId);

    await expect(svc.list(b1, false, admin)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.revoke(b1, ab, admin)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.revoke(k, ab, admin)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.revoke(k, ak2, admin)).rejects.toBeInstanceOf(NotFoundException);
    for (const id of [ab, ak, ak2]) {
      expect(
        (await q(`select deleted_at from user_role where id = $1`, [id]))[0].deleted_at,
      ).toBeNull();
    }
    // Positive control, and platform sees both tenants.
    await expect(svc.list(k, false, admin)).resolves.toMatchObject({ assignments: [{ id: ak }] });
    await expect(svc.list(b1, false, platform)).resolves.toMatchObject({
      assignments: [{ id: ab }],
    });
    await expect(svc.revoke(k, ak, admin)).resolves.toBeUndefined();
  });

  it('AC-D1D-09: platform assigns SUPER_ADMIN with NULL tenant/branch; a non-null branch is 422; non-platform lists never see it', async () => {
    const { tenantId, branchId } = await mkTenant();
    const v = await mkUser([branchId]);
    await expect(
      svc.assign(v, { roleId: role.SUPER_ADMIN, branchId }, platform),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const created = await svc.assign(v, { roleId: role.SUPER_ADMIN, branchId: null }, platform);
    expect(created.assignments[0]).toMatchObject({ tenantId: null, branchId: null });

    const ownerId = await mkUser([branchId]);
    await grant(ownerId, 'OWNER', tenantId, branchId);
    const owner = actorOf(ownerId, tenantId, ['OWNER']);
    await expect(svc.list(v, true, owner)).resolves.toMatchObject({ assignments: [] });
    await expect(svc.list(v, true, platform)).resolves.toMatchObject({
      assignments: [{ role: { code: 'SUPER_ADMIN' } }],
    });
    // A non-platform actor cannot even see (404) or revoke it.
    await expect(svc.revoke(v, created.assignments[0].id, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await svc.revoke(v, created.assignments[0].id, platform);
  });

  describe('BR-D1D-03 last OWNER (AC-D1D-18)', () => {
    it('(a) ADMIN gets 403, (b) platform gets 409, (c) a second OWNER row at another branch allows 200', async () => {
      const { tenantId, branchId, branch2Id } = await mkTenant();
      const adminId = await mkUser([branchId]);
      await grant(adminId, 'ADMIN', tenantId, branchId);
      const o1 = await mkUser([branchId, branch2Id]);
      const o1P = await grant(o1, 'OWNER', tenantId, branchId);

      await expect(
        svc.revoke(o1, o1P, actorOf(adminId, tenantId, ['ADMIN'])),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.revoke(o1, o1P, platform)).rejects.toBeInstanceOf(ConflictException);
      expect(await liveRows(o1, 'OWNER')).toHaveLength(1);

      await grant(o1, 'OWNER', tenantId, branch2Id);
      await expect(svc.revoke(o1, o1P, platform)).resolves.toBeUndefined();
      expect(await liveRows(o1, 'OWNER')).toHaveLength(1);
    });

    it('(d) two concurrent revocations of the last two OWNERs: exactly one 200 and one 409', async () => {
      const { tenantId, branchId } = await mkTenant();
      const o1 = await mkUser([branchId]);
      const o2 = await mkUser([branchId]);
      const a1 = await grant(o1, 'OWNER', tenantId, branchId);
      const a2 = await grant(o2, 'OWNER', tenantId, branchId);

      const results = await Promise.allSettled([
        svc.revoke(o1, a1, platform),
        svc.revoke(o2, a2, platform),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
      const remaining = await q(
        `select count(*)::int as n from user_role ur join role r on r.id = ur.role_id
         where ur.tenant_id = $1 and r.code = 'OWNER' and ur.deleted_at is null`,
        [tenantId],
      );
      expect(remaining[0].n).toBe(1);
    });

    it('KP-32 b: an inactive OWNER does not count as the remaining OWNER', async () => {
      const { tenantId, branchId } = await mkTenant();
      const active = await mkUser([branchId]);
      const inactive = await mkUser([branchId], 'inactive');
      const aA = await grant(active, 'OWNER', tenantId, branchId);
      await grant(inactive, 'OWNER', tenantId, branchId);

      await expect(svc.revoke(active, aA, platform)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('AC-D1D-19: after revoking APOTEKER the user keeps only KASIR permissions; re-assigning restores them', async () => {
    const { tenantId, branchId } = await mkTenant();
    const ownerId = await mkUser([branchId]);
    await grant(ownerId, 'OWNER', tenantId, branchId);
    const owner = actorOf(ownerId, tenantId, ['OWNER']);
    const k = await mkUser([branchId]);
    await svc.assign(k, { roleId: role.KASIR, branchId }, owner);
    const apo = await svc.assign(k, { roleId: role.APOTEKER, branchId }, owner);

    await svc.revoke(k, apo.assignments[0].id, owner);
    const roles = (await userRoleRepo.findEffectiveGrants(k, tenantId, branchId)).map(
      (g) => g.roleCode,
    );
    expect([...new Set(roles)]).toEqual(['KASIR']);

    await svc.assign(k, { roleId: role.APOTEKER, branchId }, owner);
    const again = (await userRoleRepo.findEffectiveGrants(k, tenantId, branchId)).map(
      (g) => g.roleCode,
    );
    expect([...new Set(again)].sort()).toEqual(['APOTEKER', 'KASIR']);
  });
});
