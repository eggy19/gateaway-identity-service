import { QueryRunner } from 'typeorm';
import {
  CreateRbac1750000000002,
  RBAC_PERMISSIONS,
  RBAC_ROLE_PERMISSIONS,
  RBAC_ROLES,
} from './migrations/1750000000002-CreateRbac';

describe('CreateRbac migration seed data', () => {
  const codes = RBAC_PERMISSIONS.map(([code]) => code);
  const platformCodes = RBAC_PERMISSIONS.filter(([, , isPlatform]) => isPlatform).map(
    ([code]) => code,
  );
  const PERMISSION_REGEX = /^[a-z]+\.[a-z][a-z_]*\.[a-z][a-z_]*$/;

  it('every permission code matches the naming convention (AC-D1A-04)', () => {
    for (const code of codes) {
      expect(code).toMatch(PERMISSION_REGEX);
    }
  });

  it('has unique permission codes and descriptions within the column limits', () => {
    expect(new Set(codes).size).toBe(codes.length);
    for (const [code, description] of RBAC_PERMISSIONS) {
      expect(code.length).toBeLessThanOrEqual(100);
      expect(description.length).toBeLessThanOrEqual(255);
    }
  });

  it('seeds the five system roles with the expected scope', () => {
    expect(RBAC_ROLES.map((r) => [r.code, r.scope])).toEqual([
      ['SUPER_ADMIN', 'PLATFORM'],
      ['OWNER', 'BRANCH'],
      ['ADMIN', 'BRANCH'],
      ['APOTEKER', 'BRANCH'],
      ['KASIR', 'BRANCH'],
    ]);
  });

  it('maps only known permissions, without duplicates, for every seeded role', () => {
    expect(Object.keys(RBAC_ROLE_PERMISSIONS).sort()).toEqual(RBAC_ROLES.map((r) => r.code).sort());
    for (const permissions of Object.values(RBAC_ROLE_PERMISSIONS)) {
      expect(new Set(permissions).size).toBe(permissions.length);
      for (const code of permissions) {
        expect(codes).toContain(code);
      }
    }
  });

  it('gives platform-only permissions to SUPER_ADMIN alone', () => {
    expect(platformCodes).toEqual(['identity.tenant.create', 'identity.tenant.update']);
    for (const [role, permissions] of Object.entries(RBAC_ROLE_PERMISSIONS)) {
      const holdsPlatform = platformCodes.some((code) => permissions.includes(code));
      expect(holdsPlatform).toBe(role === 'SUPER_ADMIN');
    }
  });

  it('SUPER_ADMIN has identity.* only (BR-RL-05)', () => {
    for (const code of RBAC_ROLE_PERMISSIONS.SUPER_ADMIN) {
      expect(code.startsWith('identity.')).toBe(true);
    }
  });

  // Hardcoded from dokumentasi/rbac/role-dan-permission.md §7.1-§7.6 (not derived from the migration).
  const IDENTITY_ALL = [
    'identity.tenant.read',
    'identity.tenant.create',
    'identity.tenant.update',
    'identity.branch.read',
    'identity.branch.create',
    'identity.branch.update',
    'identity.user.read',
    'identity.user.create',
    'identity.user.update',
    'identity.user.unlock',
    'identity.role.read',
    'identity.user_role.read',
    'identity.user_role.assign',
    'identity.user_role.revoke',
    'identity.session.read',
    'identity.session.revoke',
    'identity.login_history.read',
  ];
  const IDENTITY_TENANT = IDENTITY_ALL.filter(
    (c) => c !== 'identity.tenant.create' && c !== 'identity.tenant.update',
  );
  const sorted = (list: readonly string[]) => [...list].sort();

  it('SUPER_ADMIN = all identity.* exactly (BR-RL-05)', () => {
    expect(sorted(RBAC_ROLE_PERMISSIONS.SUPER_ADMIN)).toEqual(sorted(IDENTITY_ALL));
  });

  it('OWNER = every permission except identity.tenant.create/update', () => {
    expect(sorted(RBAC_ROLE_PERMISSIONS.OWNER)).toEqual(
      sorted(codes.filter((c) => c !== 'identity.tenant.create' && c !== 'identity.tenant.update')),
    );
    expect(codes).toHaveLength(53);
  });

  it('ADMIN matches the matrix exactly', () => {
    expect(sorted(RBAC_ROLE_PERMISSIONS.ADMIN)).toEqual(
      sorted([
        ...IDENTITY_TENANT,
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
      ]),
    );
  });

  it('APOTEKER matches the matrix exactly', () => {
    expect(sorted(RBAC_ROLE_PERMISSIONS.APOTEKER)).toEqual(
      sorted([
        'inventory.master_data.read',
        'inventory.master_data.manage',
        'inventory.item.read',
        'inventory.item.create',
        'inventory.item.update',
        'inventory.item.delete',
        'inventory.item_price.manage',
        'inventory.supplier.read',
        'inventory.supplier.manage',
        'inventory.margin_setting.read',
        'inventory.margin_setting.update',
        'inventory.purchase_order.read',
        'inventory.purchase_order.create',
        'inventory.purchase_order.submit',
        'inventory.purchase_order.approve',
        'inventory.purchase_order.reject',
        'inventory.purchase_order.cancel',
        'inventory.goods_receipt.read',
        'inventory.goods_receipt.create',
        'inventory.goods_receipt.verify',
        'inventory.goods_receipt.delete',
        'inventory.stock.read',
        'inventory.stock.adjust',
        'inventory.stock_opname.read',
        'inventory.stock_opname.create',
        'inventory.stock_opname.finalize',
        'inventory.dispensing.read',
        'inventory.dispensing.create',
        'inventory.pos_item.read',
        'billing.shift.read_all',
        'billing.sale.read_all',
      ]),
    );
  });

  it('KASIR matches the matrix exactly (KP-25)', () => {
    expect(sorted(RBAC_ROLE_PERMISSIONS.KASIR)).toEqual(
      sorted([
        'inventory.pos_item.read',
        'billing.shift.open',
        'billing.shift.close',
        'billing.shift.read',
        'billing.sale.create',
        'billing.sale.read',
      ]),
    );
  });

  it('KASIR has no read_all; APOTEKER cannot sell and has no identity.*', () => {
    expect(RBAC_ROLE_PERMISSIONS.KASIR.some((c) => c.endsWith('.read_all'))).toBe(false);
    expect(RBAC_ROLE_PERMISSIONS.APOTEKER).not.toContain('billing.shift.open');
    expect(RBAC_ROLE_PERMISSIONS.APOTEKER).not.toContain('billing.sale.create');
    expect(RBAC_ROLE_PERMISSIONS.APOTEKER.some((c) => c.startsWith('identity.'))).toBe(false);
  });
});

describe('CreateRbac migration up/down', () => {
  const run = async (method: 'up' | 'down'): Promise<string[]> => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;
    await new CreateRbac1750000000002()[method](queryRunner);
    return queries;
  };

  it('up creates the four tables, partial unique indexes and the user_role check', async () => {
    const sql = (await run('up')).join('\n');
    for (const table of ['permission', 'role', 'role_permission', 'user_role']) {
      expect(sql).toContain(`create table "${table}"`);
    }
    expect(sql).toContain('uq_permission_code');
    expect(sql).toContain('uq_role_tenant_code');
    expect(sql).toContain('uq_role_permission_role_permission');
    expect(sql).toContain('uq_user_role_user_role_branch');
    expect(sql).toContain('chk_user_role_tenant_branch');
    expect(sql).toContain('chk_role_scope');
    expect(sql).toContain('chk_role_status');
    expect(sql).toContain('idx_user_role_role_tenant');
    expect(sql.match(/where "deleted_at" is null/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('down drops the RBAC tables children-first and nothing else', async () => {
    const queries = await run('down');
    expect(queries).toEqual([
      'drop table if exists "user_role"',
      'drop table if exists "role_permission"',
      'drop table if exists "role"',
      'drop table if exists "permission"',
    ]);
  });
});
