// Better Auth ships ESM only; no session/login is exercised here.
jest.mock('better-auth', () => ({ betterAuth: () => ({ api: {}, handler: jest.fn() }) }));

import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { UserAdminService } from '../../src/modules/identity-admin/services/user-admin.service';
import { UserRoleRepository } from '../../src/modules/role/repositories/user-role.repository';
import { TenantRepository } from '../../src/modules/tenant/repositories/tenant.repository';
import { UserStatus } from '../../src/modules/user/enums/user-status.enum';
import type { ActorScope } from '../../src/shared/auth/actor-scope';

/**
 * T-19 follow-up integration test (real SQL, local PostgreSQL) for the queries behind KP-33 and
 * BR-D1D-03: countOtherActiveOwners, findHeldRoleCodes, lockByIds and the concurrent
 * deactivation of the last two OWNERs. Random data, cleaned up in afterAll (asserted).
 */
describe('G1 OWNER guards - real SQL + PostgreSQL', () => {
  let app: INestApplication;
  let ds: DataSource;
  let userRoleRepo: UserRoleRepository;
  let tenantRepo: TenantRepository;
  let admin: UserAdminService;

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

  async function mkTenantWithBranch(): Promise<{ tenantId: string; branchId: string }> {
    const [t] = await q(
      `insert into tenant (name, code, status) values ($1, $2, 'active') returning id`,
      [`G1 ${tag}`, `G1INT-${tag}-${tenantIds.length}`],
    );
    tenantIds.push(t.id);
    const [b] = await q(
      `insert into branch (tenant_id, name, code, status) values ($1, $2, $3, 'active') returning id`,
      [t.id, `G1 br ${tag}`, `B${branchIds.length}-${tag}`],
    );
    branchIds.push(b.id);
    return { tenantId: t.id, branchId: b.id };
  }
  async function mkUser(status: 'active' | 'inactive' = 'active'): Promise<string> {
    const id = randomUUID();
    await q(
      `insert into "user" (id, name, email, "emailVerified", status) values ($1, 'G1 user', $2, true, $3)`,
      [id, `g1-int-${tag}-${userIds.length}@test.invalid`, status],
    );
    userIds.push(id);
    return id;
  }
  async function grant(
    userId: string,
    code: string,
    tenantId: string,
    branchId: string,
    deleted = false,
  ): Promise<void> {
    await q(
      `insert into user_role (user_id, role_id, tenant_id, branch_id, deleted_at)
       values ($1, $2, $3, $4, ${deleted ? 'now()' : 'null'})`,
      [userId, role[code], tenantId, branchId],
    );
  }
  const statusOf = async (id: string): Promise<string> =>
    (await q(`select status from "user" where id = $1`, [id]))[0].status;

  beforeAll(async () => {
    for (const k of ['INVENTORY', 'BILLING', 'CLINICAL', 'NOTIFICATION']) {
      process.env[`${k}_SERVICE_URL`] ??= 'http://127.0.0.1:1';
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get<DataSource>(getDataSourceToken());
    userRoleRepo = app.get(UserRoleRepository);
    tenantRepo = app.get(TenantRepository, { strict: false });
    admin = app.get(UserAdminService);

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
          `delete from user_role where user_id in (select id from "user" where email like 'g1-int-%@test.invalid')`,
        );
        await q(`delete from "user" where email like 'g1-int-%@test.invalid'`);

        const left = await q(
          `select
           (select count(*) from user_role where user_id = any($1::uuid[]))::int as ur,
           (select count(*) from "user" where id = any($1::uuid[]) or email like 'g1-int-%@test.invalid')::int as u,
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

  describe('countOtherActiveOwners', () => {
    it('excludes the user itself, inactive users and soft-deleted OWNER assignments', async () => {
      const { tenantId, branchId } = await mkTenantWithBranch();
      const subject = await mkUser();
      const otherActive = await mkUser();
      const inactiveOwner = await mkUser('inactive');
      const revokedOwner = await mkUser();
      const admin1 = await mkUser();
      await grant(subject, 'OWNER', tenantId, branchId);
      await grant(otherActive, 'OWNER', tenantId, branchId);
      await grant(inactiveOwner, 'OWNER', tenantId, branchId);
      await grant(revokedOwner, 'OWNER', tenantId, branchId, true);
      await grant(admin1, 'ADMIN', tenantId, branchId);

      await expect(userRoleRepo.countOtherActiveOwners(tenantId, subject)).resolves.toBe(1);
      // From the other active owner's view only `subject` counts.
      await expect(userRoleRepo.countOtherActiveOwners(tenantId, otherActive)).resolves.toBe(1);
    });

    it('is 0 when every other OWNER is inactive or revoked, and is tenant-scoped', async () => {
      const a = await mkTenantWithBranch();
      const b = await mkTenantWithBranch();
      const subject = await mkUser();
      const inactiveOwner = await mkUser('inactive');
      const ownerOfB = await mkUser();
      await grant(subject, 'OWNER', a.tenantId, a.branchId);
      await grant(inactiveOwner, 'OWNER', a.tenantId, a.branchId);
      await grant(ownerOfB, 'OWNER', b.tenantId, b.branchId);

      await expect(userRoleRepo.countOtherActiveOwners(a.tenantId, subject)).resolves.toBe(0);
    });
  });

  describe('findHeldRoleCodes / findOwnerTenantIds', () => {
    it('returns only live assignments of the requested codes', async () => {
      const { tenantId, branchId } = await mkTenantWithBranch();
      const u = await mkUser();
      await grant(u, 'ADMIN', tenantId, branchId);
      await grant(u, 'KASIR', tenantId, branchId);
      await grant(u, 'OWNER', tenantId, branchId, true);

      const held = await userRoleRepo.findHeldRoleCodes(u, ['OWNER', 'ADMIN', 'SUPER_ADMIN']);
      expect(held).toEqual(['ADMIN']);
      await expect(userRoleRepo.findHeldRoleCodes(u, ['SUPER_ADMIN'])).resolves.toEqual([]);
    });

    it('findOwnerTenantIds lists distinct tenants of live OWNER assignments only', async () => {
      const a = await mkTenantWithBranch();
      const b = await mkTenantWithBranch();
      const u = await mkUser();
      await grant(u, 'OWNER', a.tenantId, a.branchId);
      await grant(u, 'OWNER', b.tenantId, b.branchId, true);

      await expect(userRoleRepo.findOwnerTenantIds(u)).resolves.toEqual([a.tenantId]);
    });
  });

  describe('lockByIds', () => {
    it('issues FOR UPDATE and really blocks another locker until the transaction ends', async () => {
      const { tenantId } = await mkTenantWithBranch();
      const qr = ds.createQueryRunner();
      const sqls: string[] = [];
      const original = qr.query.bind(qr);
      qr.query = ((...args: Parameters<typeof qr.query>) => {
        sqls.push(args[0]);
        return original(...args);
      }) as typeof qr.query;
      await qr.startTransaction();
      try {
        await tenantRepo.lockByIds([tenantId], qr.manager);
        expect(sqls.some((s) => /FOR UPDATE/i.test(s))).toBe(true);

        // A second connection cannot take the row lock while the first one holds it.
        await expect(
          q(`select id from tenant where id = $1 for update nowait`, [tenantId]),
        ).rejects.toMatchObject({ code: '55P03' });
      } finally {
        await qr.rollbackTransaction();
        await qr.release();
      }
      await expect(
        q(`select id from tenant where id = $1 for update nowait`, [tenantId]),
      ).resolves.toHaveLength(1);
    });
  });

  describe('concurrent deactivation of the last two OWNERs (BR-D1D-03)', () => {
    it('lets exactly one succeed; the other gets 409 and one active OWNER remains', async () => {
      const { tenantId, branchId } = await mkTenantWithBranch();
      const x = await mkUser();
      const y = await mkUser();
      await grant(x, 'OWNER', tenantId, branchId);
      await grant(y, 'OWNER', tenantId, branchId);
      await q(
        `insert into user_branch (user_id, branch_id, is_primary) values ($1,$2,true),($3,$2,true)`,
        [x, branchId, y],
      );

      const results = await Promise.allSettled([
        admin.updateStatus(x, { status: UserStatus.Inactive }, platform),
        admin.updateStatus(y, { status: UserStatus.Inactive }, platform),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);

      const statuses = [await statusOf(x), await statusOf(y)].sort();
      expect(statuses).toEqual(['active', 'inactive']);
    });
  });
});
