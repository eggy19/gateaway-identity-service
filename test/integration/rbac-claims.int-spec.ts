// Better Auth ships ESM only; session/login are out of scope here (resolver, proxy and /auth/me are called directly).
jest.mock('better-auth', () => ({ betterAuth: () => ({ api: {}, handler: jest.fn() }) }));

import { HttpService } from '@nestjs/axios';
import { ForbiddenException, INestApplication, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { decodeJwt } from 'jose';
import { DataSource, QueryRunner } from 'typeorm';
import { AppModule } from '../../src/app.module';
import {
  RBAC_ROLE_PERMISSIONS,
  RBAC_ROLES,
} from '../../src/database/migrations/1750000000002-CreateRbac';
import { RbacTenantBranchIntegrity1750000000003 } from '../../src/database/migrations/1750000000003-RbacTenantBranchIntegrity';
import { AuthController } from '../../src/modules/auth/controllers/auth.controller';
import { GATEWAY_ROUTES } from '../../src/modules/gateway/gateway-routes.config';
import { GatewayService } from '../../src/modules/gateway/gateway.service';
import { InternalJwtService } from '../../src/shared/internal-jwt/internal-jwt.service';

/**
 * T-18 integration test (AC-D1B-01..15) against the real app wiring + local PostgreSQL.
 * - Random tenants/branches/users; custom (tenant-owned) roles/permissions are used for every
 *   test that mutates role data, so the shared system roles/matrix are only ever READ.
 * - Downstream HTTP is a spy on `HttpService.axiosRef.request`; the Internal JWT is the real one.
 * - Cleanup in afterAll deletes (test data only) and asserts 0 rows remain.
 */
describe('T-16a/T-16b RBAC claims - real app + PostgreSQL', () => {
  let app: INestApplication;
  let ds: DataSource;
  let gateway: GatewayService;
  let authCtl: AuthController;
  let jwtSvc: InternalJwtService;

  const tag = randomUUID().slice(0, 8);
  let seq = 0;
  const requestMock = jest.fn();

  const tenantIds: string[] = [];
  const branchIds: string[] = [];
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const permissionIds: string[] = [];
  const systemRole: Record<string, string> = {};

  let t1: string;
  let t2: string;
  let branchA: string; // T1, primary of most users
  let branchQ: string; // T1, secondary
  let branchC: string; // T2

  const q = <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => ds.query(sql, params);

  async function mkTenant(status = 'active'): Promise<string> {
    const [row] = await q(
      `insert into tenant (name, code, status) values ($1, $2, $3) returning id`,
      [`T18 ${tag}`, `T18INT-${tag}-${tenantIds.length}`, status],
    );
    tenantIds.push(row.id);
    return row.id;
  }
  async function mkBranch(tenantId: string, status = 'active'): Promise<string> {
    const [row] = await q(
      `insert into branch (tenant_id, name, code, status) values ($1, $2, $3, $4) returning id`,
      [tenantId, `T18 br ${tag}`, `B${branchIds.length}-${tag}`, status],
    );
    branchIds.push(row.id);
    return row.id;
  }
  async function mkUser(name: string, branchId: string | null): Promise<string> {
    const id = randomUUID();
    await q(
      `insert into "user" (id, name, email, "emailVerified", status) values ($1, $2, $3, true, 'active')`,
      [id, name, `t18-int-${tag}-${userIds.length}@test.invalid`],
    );
    userIds.push(id);
    if (branchId) {
      await q(`insert into user_branch (user_id, branch_id, is_primary) values ($1, $2, true)`, [
        id,
        branchId,
      ]);
    }
    return id;
  }
  async function grant(
    userId: string,
    roleId: string,
    tenantId: string | null,
    branchId: string | null,
  ): Promise<string> {
    const [row] = await q(
      `insert into user_role (user_id, role_id, tenant_id, branch_id) values ($1,$2,$3,$4) returning id`,
      [userId, roleId, tenantId, branchId],
    );
    return row.id;
  }
  async function mkPermission(code: string): Promise<string> {
    const [service, resource, action] = code.split('.');
    const [row] = await q(
      `insert into permission (code, service, resource, action, description) values ($1,$2,$3,$4,'t18') returning id`,
      [code, service, resource, action],
    );
    permissionIds.push(row.id);
    return row.id;
  }
  /** Tenant-owned BRANCH role (does not collide with the system role of the same code). */
  async function mkRole(code: string, tenantId: string, permIds: string[]): Promise<string> {
    const [row] = await q(
      `insert into role (tenant_id, code, name, scope, is_system, status)
       values ($1,$2,$2,'BRANCH',false,'active') returning id`,
      [tenantId, code],
    );
    roleIds.push(row.id);
    for (const p of permIds) {
      await q(`insert into role_permission (role_id, permission_id) values ($1,$2)`, [row.id, p]);
    }
    return row.id;
  }

  async function forward(userId: string, service = 'inventory') {
    requestMock.mockClear();
    const [u] = await q(`select id, name from "user" where id = $1`, [userId]);
    const res = await gateway.forward(
      {
        method: 'GET',
        originalUrl: `/api/v1/${service}/master/items`,
        url: `/api/v1/${service}/master/items`,
        headers: {},
        requestId: 'req-t18',
      } as any,
      { id: u.id, name: u.name } as any,
      { id: 'sess-t18' } as any,
      service,
    );
    const cfg = requestMock.mock.calls[0]?.[0];
    const token: string | undefined = cfg?.headers?.['x-user-context'];
    return { res, token, claims: token ? decodeJwt(token) : undefined };
  }
  const me = (userId: string) => authCtl.me({ id: userId } as any);
  const prefixed = (perms: string[], p: string) => perms.filter((x) => x.startsWith(`${p}.`));

  beforeAll(async () => {
    for (const k of ['INVENTORY', 'BILLING', 'CLINICAL', 'NOTIFICATION']) {
      process.env[`${k}_SERVICE_URL`] ??= 'http://127.0.0.1:1';
    }
    requestMock.mockImplementation(async () => ({ status: 200, data: { ok: true } }));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HttpService)
      .useValue({ axiosRef: { request: requestMock } })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get<DataSource>(getDataSourceToken());
    gateway = app.get(GatewayService);
    authCtl = app.get(AuthController);
    jwtSvc = app.get(InternalJwtService);

    for (const r of await q(
      `select id, code from role where tenant_id is null and deleted_at is null`,
    )) {
      systemRole[r.code] = r.id;
    }
    t1 = await mkTenant();
    t2 = await mkTenant();
    branchA = await mkBranch(t1);
    branchQ = await mkBranch(t1);
    branchC = await mkBranch(t2);
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        const uids = userIds;
        await q(`delete from user_role where user_id = any($1::uuid[])`, [uids]);
        await q(`delete from user_branch where user_id = any($1::uuid[])`, [uids]);
        await q(`delete from role_permission where role_id = any($1::uuid[])`, [roleIds]);
        await q(`delete from role where id = any($1::uuid[])`, [roleIds]);
        await q(`delete from permission where id = any($1::uuid[])`, [permissionIds]);
        await q(`delete from "user" where id = any($1::uuid[])`, [uids]);
        await q(`delete from branch where id = any($1::uuid[])`, [branchIds]);
        await q(`delete from tenant where id = any($1::uuid[])`, [tenantIds]);
        // Leftovers of earlier crashed runs (test data only, identified by prefix).
        await q(
          `delete from user_role where user_id in (select id from "user" where email like 't18-int-%@test.invalid')`,
        );
        await q(
          `delete from user_branch where user_id in (select id from "user" where email like 't18-int-%@test.invalid')`,
        );
        await q(`delete from "user" where email like 't18-int-%@test.invalid'`);

        const left = await q(
          `select
           (select count(*) from user_role where user_id = any($1::uuid[]))::int as ur,
           (select count(*) from user_branch where user_id = any($1::uuid[]))::int as ub,
           (select count(*) from "user" where id = any($1::uuid[]) or email like 't18-int-%@test.invalid')::int as u,
           (select count(*) from role where id = any($2::uuid[]))::int as r,
           (select count(*) from role_permission where role_id = any($2::uuid[]))::int as rp,
           (select count(*) from permission where id = any($3::uuid[]))::int as p,
           (select count(*) from branch where id = any($4::uuid[]))::int as b,
           (select count(*) from tenant where id = any($5::uuid[]))::int as t`,
          [userIds, roleIds, permissionIds, branchIds, tenantIds],
        );
        expect(left[0]).toEqual({ ur: 0, ub: 0, u: 0, r: 0, rp: 0, p: 0, b: 0, t: 0 });
      }
    } finally {
      // Always close the app so a failed cleanup cannot hang Jest.
      await app?.close();
    }
  });

  // ───────────────────────── AC-D1B-01..05, 13, 14: resolver per role ─────────────────────────
  describe('resolver per system role vs matrix (read-only on system data)', () => {
    for (const role of ['KASIR', 'ADMIN', 'APOTEKER', 'OWNER']) {
      it(`AC-D1B-01/13 ${role}: me, JWT inventory & billing follow the matrix, no identity.*/platform`, async () => {
        const u = await mkUser('Siti Rahmawati', branchA);
        await grant(u, systemRole[role], t1, branchA);
        const expected = [...RBAC_ROLE_PERMISSIONS[role]].sort();

        const profile = await me(u);
        expect(profile.roles).toEqual([role]);
        expect(profile.permissions).toEqual(expected);
        expect(profile.context?.status).toBe('active');

        for (const svc of ['inventory', 'billing']) {
          const { claims } = await forward(u, svc);
          expect(claims?.aud).toBe(GATEWAY_ROUTES[svc].audience);
          expect(claims?.roles).toEqual([role]);
          expect(claims?.permissions).toEqual(prefixed(profile.permissions, svc));
          expect(claims?.permissions).toEqual(prefixed(expected, svc));
          expect((claims?.permissions as string[]).every((p) => p.startsWith(`${svc}.`))).toBe(
            true,
          );
          expect(claims?.tenantId).toBe(t1);
          expect(claims?.branchId).toBe(branchA);
        }
      });
    }

    it('AC-D1B-02 OWNER + APOTEKER: union without duplicates, sorted', async () => {
      const u = await mkUser('Dua Role', branchA);
      await grant(u, systemRole.OWNER, t1, branchA);
      await grant(u, systemRole.APOTEKER, t1, branchA);
      const { claims } = await forward(u);
      expect(claims?.roles).toEqual(['APOTEKER', 'OWNER']);
      const perms = claims?.permissions as string[];
      expect(new Set(perms).size).toBe(perms.length);
      expect(perms).toEqual([...perms].sort());
      expect(perms).toEqual(prefixed([...RBAC_ROLE_PERMISSIONS.OWNER].sort(), 'inventory'));
    });

    it('AC-D1B-03 APOTEKER only at branch Q while primary is A: roles [] permissions []', async () => {
      const u = await mkUser('Cabang Lain', branchA);
      await grant(u, systemRole.APOTEKER, t1, branchQ);
      const { claims } = await forward(u);
      expect(claims?.roles).toEqual([]);
      expect(claims?.permissions).toEqual([]);
      expect((await me(u)).permissions).toEqual([]);
    });

    it('AC-D1B-04 revoked KASIR -> next request has permissions [] without logout', async () => {
      const u = await mkUser('Dicabut', branchA);
      const id = await grant(u, systemRole.KASIR, t1, branchA);
      expect(
        ((await forward(u, 'billing')).claims?.permissions as string[]).length,
      ).toBeGreaterThan(0);
      await q(`update user_role set deleted_at = now() where id = $1`, [id]);
      const { claims } = await forward(u, 'billing');
      expect(claims?.permissions).toEqual([]);
      expect(claims?.roles).toEqual([]);
    });

    it('AC-D1B-05/13 SUPER_ADMIN + OWNER: no SUPER_ADMIN in JWT roles, no identity.* in any JWT, me keeps it', async () => {
      const u = await mkUser('Platform', branchA);
      await grant(u, systemRole.SUPER_ADMIN, null, null);
      await grant(u, systemRole.OWNER, t1, branchA);
      const profile = await me(u);
      expect(profile.roles).toEqual(['OWNER', 'SUPER_ADMIN']);
      expect(profile.permissions).toContain('identity.tenant.create');
      for (const svc of Object.keys(GATEWAY_ROUTES).filter(
        (s) => s === 'inventory' || s === 'billing',
      )) {
        const { claims } = await forward(u, svc);
        expect(claims?.roles).toEqual(['OWNER']);
        expect((claims?.permissions as string[]).some((p) => p.startsWith('identity.'))).toBe(
          false,
        );
      }
    });

    it('AC-D1B-14 every GATEWAY_ROUTES key: aud + only own prefix; unknown service -> 404 and nothing signed', async () => {
      const u = await mkUser('Semua Route', branchA);
      await grant(u, systemRole.OWNER, t1, branchA);
      const configured = app.get<any>(GatewayService)['config'].get('gateway').services as Record<
        string,
        string
      >;
      for (const [key, route] of Object.entries(GATEWAY_ROUTES)) {
        expect(configured[key]).toBeTruthy();
        const { claims } = await forward(u, key);
        expect(claims?.aud).toBe(route.audience);
        expect((claims?.permissions as string[]).every((p) => p.startsWith(`${key}.`))).toBe(true);
      }
      const signSpy = jest.spyOn(jwtSvc, 'sign');
      await expect(forward(u, 'unknown')).rejects.toBeInstanceOf(NotFoundException);
      expect(signSpy).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
      signSpy.mockRestore();
    });
  });

  // ───────────────────────── AC-D1B-06: inactive tenant/branch ─────────────────────────
  describe('AC-D1B-06 inactive tenant/branch', () => {
    async function setup(tenantStatus: string, branchStatus: string, softDeleteBranch = false) {
      const t = await mkTenant(tenantStatus);
      const b = await mkBranch(t, branchStatus);
      if (softDeleteBranch) await q(`update branch set deleted_at = now() where id = $1`, [b]);
      const u = await mkUser('Nonaktif', b);
      await grant(u, systemRole.OWNER, t, b);
      return u;
    }

    it('branch inactive -> proxy 403 (nothing forwarded), me.context.status = branch_inactive', async () => {
      const u = await setup('active', 'inactive');
      await expect(forward(u)).rejects.toBeInstanceOf(ForbiddenException);
      expect(requestMock).not.toHaveBeenCalled();
      expect((await me(u)).context?.status).toBe('branch_inactive');
    });
    it('tenant inactive -> proxy 403, me.context.status = tenant_inactive', async () => {
      const u = await setup('inactive', 'active');
      await expect(forward(u)).rejects.toBeInstanceOf(ForbiddenException);
      expect(requestMock).not.toHaveBeenCalled();
      expect((await me(u)).context?.status).toBe('tenant_inactive');
    });
    it('branch soft-deleted -> proxy 403, status branch_inactive', async () => {
      const u = await setup('active', 'active', true);
      await expect(forward(u)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await me(u)).context?.status).toBe('branch_inactive');
    });
    it('reactivating the branch takes effect on the next request (no cache)', async () => {
      const u = await setup('active', 'inactive');
      await expect(forward(u)).rejects.toBeInstanceOf(ForbiddenException);
      const [{ branch_id }] = await q(`select branch_id from user_branch where user_id = $1`, [u]);
      await q(`update branch set status = 'active' where id = $1`, [branch_id]);
      expect((await forward(u)).res.status).toBe(200);
    });
  });

  // ───────────────────────── AC-D1B-11: scope-inconsistent rows ignored ─────────────────────────
  describe('AC-D1B-11 scope-inconsistent user_role rows', () => {
    it('BRANCH role with NULL tenant/branch and PLATFORM role with a branch are ignored, no 500', async () => {
      const u = await mkUser('Owner Null', branchA);
      await grant(u, systemRole.OWNER, null, null);
      const v = await mkUser('Super Cabang', branchA);
      await grant(v, systemRole.SUPER_ADMIN, t1, branchA);
      const w = await mkUser('Owner Valid', branchA);
      await grant(w, systemRole.OWNER, t1, branchA);

      const pu = await me(u);
      expect(pu.roles).toEqual([]);
      expect(pu.permissions).toEqual([]);
      const ju = await forward(u);
      expect(ju.res.status).toBe(200);
      expect(ju.claims?.roles).toEqual([]);
      expect(ju.claims?.permissions).toEqual([]);

      const pv = await me(v);
      expect(pv.roles).not.toContain('SUPER_ADMIN');
      expect(pv.permissions).not.toContain('identity.tenant.create');
      expect(pv.permissions).toEqual([]);
      const jv = await forward(v);
      expect(jv.res.status).toBe(200);
      expect(jv.claims?.roles).toEqual([]);

      const pw = await me(w);
      expect(pw.roles).toEqual(['OWNER']);
      expect((await forward(w)).claims?.roles).toEqual(['OWNER']);
    });
  });

  // ───────────────────────── AC-D1B-12 + gaps: soft delete / inactive ─────────────────────────
  describe('AC-D1B-12 soft delete & inactive (tenant-owned clone roles, system matrix untouched)', () => {
    let pInv: string;
    let pSale: string;
    let pOther: string;
    let kasir: string;
    let apoteker: string;
    let pInvCode: string;
    let pSaleCode: string;
    let pOtherCode: string;
    let u: string;
    let urApt: string;

    beforeEach(async () => {
      seq++;
      const tn = await mkTenant();
      const br = await mkBranch(tn);
      pInvCode = `inventory.t18${tag}x${seq}.read`;
      pSaleCode = `billing.t18${tag}x${seq}.create`;
      pOtherCode = `billing.t18${tag}x${seq}.read`;
      pInv = await mkPermission(pInvCode);
      pSale = await mkPermission(pSaleCode);
      pOther = await mkPermission(pOtherCode);
      kasir = await mkRole('KASIR', tn, [pInv, pSale, pOther]);
      apoteker = await mkRole('APOTEKER', tn, [pOther]);
      u = await mkUser('Dua Role', br);
      await grant(u, kasir, tn, br);
      urApt = await grant(u, apoteker, tn, br);
    });

    const bill = async () => ((await forward(u, 'billing')).claims?.permissions as string[]) ?? [];
    const inv = async () => ((await forward(u, 'inventory')).claims?.permissions as string[]) ?? [];

    it('baseline: both roles contribute', async () => {
      expect(await bill()).toEqual([pSaleCode, pOtherCode].sort());
      expect(await inv()).toEqual([pInvCode]);
      expect((await me(u)).roles).toEqual(['APOTEKER', 'KASIR']);
    });
    it('(a) APOTEKER user_role soft-deleted -> its role gone, KASIR permissions stay', async () => {
      await q(`update user_role set deleted_at = now() where id = $1`, [urApt]);
      expect((await me(u)).roles).toEqual(['KASIR']);
      expect(await bill()).toEqual([pSaleCode, pOtherCode].sort());
    });
    it('(b) role_permission soft-deleted -> that permission gone from JWT and me, others stay', async () => {
      await q(
        `update role_permission set deleted_at = now() where role_id = $1 and permission_id = $2`,
        [kasir, pSale],
      );
      expect(await bill()).toEqual([pOtherCode]);
      expect((await me(u)).permissions).not.toContain(pSaleCode);
      expect((await me(u)).permissions).toContain(pInvCode);
    });
    it('(c) permission soft-deleted -> code gone, role stays', async () => {
      await q(`update permission set deleted_at = now() where id = $1`, [pInv]);
      expect(await inv()).toEqual([]);
      expect((await me(u)).roles).toContain('KASIR');
      expect(await bill()).toEqual([pSaleCode, pOtherCode].sort());
    });
    it('(d1) role soft-deleted -> role and its permissions gone', async () => {
      await q(`update role set deleted_at = now() where id = $1`, [kasir]);
      expect((await me(u)).roles).toEqual(['APOTEKER']);
      expect(await bill()).toEqual([pOtherCode]);
      expect(await inv()).toEqual([]);
    });
    it('(d2) role status inactive -> not counted; back to active -> counted again', async () => {
      await q(`update role set status = 'inactive' where id = $1`, [kasir]);
      expect((await me(u)).roles).toEqual(['APOTEKER']);
      expect(await inv()).toEqual([]);
      await q(`update role set status = 'active' where id = $1`, [kasir]);
      expect(await inv()).toEqual([pInvCode]);
    });
    it('role without any permission still appears in roles with permissions []', async () => {
      const bare = await mkRole('ADMIN', t1, []);
      const v = await mkUser('Role Kosong', branchA);
      await grant(v, bare, t1, branchA);
      const profile = await me(v);
      expect(profile.roles).toEqual(['ADMIN']);
      expect(profile.permissions).toEqual([]);
    });
  });

  // ───────────────────────── gaps: no role / no branch ─────────────────────────
  describe('gaps: user without role / without branch', () => {
    it('user without any role -> permissions [] roles [] (200, not 500)', async () => {
      const u = await mkUser('Tanpa Role', branchA);
      const profile = await me(u);
      expect(profile.roles).toEqual([]);
      expect(profile.permissions).toEqual([]);
      const { res, claims } = await forward(u);
      expect(res.status).toBe(200);
      expect(claims?.roles).toEqual([]);
      expect(claims?.permissions).toEqual([]);
    });
    it('user without branch assignment -> me ok with context null, proxy 403 (not 500)', async () => {
      const u = await mkUser('Tanpa Cabang', null);
      await grant(u, systemRole.SUPER_ADMIN, null, null);
      const profile = await me(u);
      expect(profile.context).toBeNull();
      expect(profile.roles).toEqual(['SUPER_ADMIN']);
      await expect(forward(u)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ───────────────────────── AC-D1B-07 + AC-D1B-15: name claim ─────────────────────────
  describe('JWT name claim', () => {
    it('AC-D1B-15 normal name passes through unchanged', async () => {
      const u = await mkUser('Siti Rahmawati', branchA);
      expect((await forward(u)).claims?.name).toBe('Siti Rahmawati');
    });
    it('AC-D1B-15 200 chars with leading spaces -> first 150 after trim', async () => {
      const body = Array.from({ length: 200 }, (_, i) => String.fromCharCode(97 + (i % 26))).join(
        '',
      );
      const u = await mkUser(`   ${body}`, branchA);
      expect((await forward(u)).claims?.name).toBe(body.slice(0, 150));
    });
    it('AC-D1B-07 150 emoji/accented name + OWNER: cut by code point, header < 4 KB', async () => {
      const emoji = '😀'.repeat(200);
      const u = await mkUser(emoji, branchA);
      await grant(u, systemRole.OWNER, t1, branchA);
      const { token, claims } = await forward(u);
      expect(Array.from(claims?.name as string)).toHaveLength(150);
      expect(claims?.name).toBe('😀'.repeat(150));
      expect(Buffer.byteLength(token as string)).toBeLessThan(4096);

      const accent = await mkUser(`  ${'é'.repeat(180)}`, branchA);
      await grant(accent, systemRole.OWNER, t1, branchA);
      const r2 = await forward(accent);
      expect(r2.claims?.name).toBe('é'.repeat(150));
      expect(Buffer.byteLength(r2.token as string)).toBeLessThan(4096);
    });
    it('whitespace-only name -> empty string (no crash)', async () => {
      const u = await mkUser('    ', branchA);
      expect((await forward(u)).claims?.name).toBe('');
    });
    it('AC-D1B-15 privacy: unique name marker never reaches Gateway logs (success + downstream 403)', async () => {
      const marker = `NamaUjiZx${tag}`;
      const u = await mkUser(marker, branchA);
      await grant(u, systemRole.KASIR, t1, branchA);
      const lines: string[] = [];
      const spies = (['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const).map((lvl) =>
        jest.spyOn(Logger.prototype, lvl).mockImplementation((...a: unknown[]) => {
          lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
        }),
      );
      try {
        await forward(u);
        requestMock.mockImplementationOnce(async () => ({ status: 403, data: { message: 'no' } }));
        expect((await forward(u)).res.status).toBe(403);
        requestMock.mockImplementationOnce(async () => {
          const e: any = new Error('boom');
          e.isAxiosError = true;
          throw e;
        });
        await forward(u).catch(() => undefined);
      } finally {
        spies.forEach((s) => s.mockRestore());
      }
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).not.toContain(marker);
    });
  });

  // ───────────────────────── AC-D1B-08..10: DB integrity (ROLLBACK) ─────────────────────────
  describe('AC-D1B-08..10 DB integrity (inside transaction, ROLLBACK)', () => {
    let qr: QueryRunner;
    let u: string;
    beforeEach(async () => {
      u = await mkUser('Integritas', branchA);
      qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
    });
    afterEach(async () => {
      await qr.rollbackTransaction();
      await qr.release();
    });

    const insertRole = (role: string, tenant: string | null, branch: string | null) =>
      qr.query(
        `insert into user_role (user_id, role_id, tenant_id, branch_id) values ($1,$2,$3,$4)`,
        [u, systemRole[role], tenant, branch],
      );
    async function expectDbError(fn: () => Promise<unknown>, code: string, constraint: string) {
      await qr.query('savepoint sp');
      let err: any;
      try {
        await fn();
      } catch (e) {
        err = e;
      }
      await qr.query('rollback to savepoint sp');
      expect(err?.driverError?.code ?? err?.code).toBe(code);
      expect(err?.driverError?.constraint ?? err?.constraint).toBe(constraint);
    }
    const urCount = async (uid = u) =>
      (await qr.query(`select count(*)::int c from user_role where user_id = $1`, [uid]))[0].c;

    it('AC-D1B-08 insert with tenant of another tenant -> 23503 fk_user_role_branch_tenant, nothing stored', async () => {
      await expectDbError(
        () => insertRole('KASIR', t2, branchA),
        '23503',
        'fk_user_role_branch_tenant',
      );
      expect(await urCount()).toBe(0);
      await expectDbError(
        () => insertRole('KASIR', t1, branchC),
        '23503',
        'fk_user_role_branch_tenant',
      );
      expect(await urCount()).toBe(0);
    });
    it('AC-D1B-08 update tenant_id of an existing valid row -> 23503; positive insert (T1, P) works', async () => {
      await insertRole('KASIR', t1, branchA);
      expect(await urCount()).toBe(1);
      await expectDbError(
        () => qr.query(`update user_role set tenant_id = $1 where user_id = $2`, [t2, u]),
        '23503',
        'fk_user_role_branch_tenant',
      );
      const [row] = await qr.query(`select tenant_id from user_role where user_id = $1`, [u]);
      expect(row.tenant_id).toBe(t1);
    });
    it('AC-D1B-08 platform NULL/NULL passes; half-NULL rejected by chk_user_role_tenant_branch (23514)', async () => {
      await insertRole('SUPER_ADMIN', null, null);
      expect(await urCount()).toBe(1);
      await expectDbError(
        () => insertRole('OWNER', t1, null),
        '23514',
        'chk_user_role_tenant_branch',
      );
      await expectDbError(
        () => insertRole('OWNER', null, branchA),
        '23514',
        'chk_user_role_tenant_branch',
      );
    });
    it('AC-D1B-09 hard delete of user with active or revoked role -> 23503 fk_user_role_user, rows intact', async () => {
      await insertRole('KASIR', t1, branchA);
      await insertRole('APOTEKER', t1, branchA);
      await qr.query(
        `update user_role set deleted_at = now() where user_id = $1 and role_id = $2`,
        [u, systemRole.APOTEKER],
      );
      await qr.query(`delete from user_branch where user_id = $1`, [u]);
      await expectDbError(
        () => qr.query(`delete from "user" where id = $1`, [u]),
        '23503',
        'fk_user_role_user',
      );
      expect(await urCount()).toBe(2);
    });
    it('AC-D1B-10 constraints exist with RESTRICT; down() restores pre-T-16a state, up() again, data unchanged', async () => {
      const state = async () => {
        const cons = await qr.query(
          `select conname, confdeltype from pg_constraint
           where conname in ('uq_branch_id_tenant_id','fk_user_role_branch_tenant','fk_user_role_branch','fk_user_role_user')
           order by conname`,
        );
        return Object.fromEntries(cons.map((c: any) => [c.conname, c.confdeltype]));
      };
      const rows = async () =>
        (await qr.query(`select count(*)::int c from user_role`))[0].c as number;
      const before = await rows();

      expect(await state()).toEqual({
        uq_branch_id_tenant_id: ' ',
        fk_user_role_branch_tenant: 'r',
        fk_user_role_user: 'r',
      });

      const migration = new RbacTenantBranchIntegrity1750000000003();
      await migration.down(qr);
      expect(await state()).toEqual({ fk_user_role_branch: 'r', fk_user_role_user: 'c' });
      expect(await rows()).toBe(before);

      await migration.up(qr);
      expect(await state()).toEqual({
        uq_branch_id_tenant_id: ' ',
        fk_user_role_branch_tenant: 'r',
        fk_user_role_user: 'r',
      });
      expect(await rows()).toBe(before);
    });
  });

  it('sanity: system roles seeded as the migration constant expects', () => {
    for (const r of RBAC_ROLES) expect(systemRole[r.code]).toBeTruthy();
  });
});
