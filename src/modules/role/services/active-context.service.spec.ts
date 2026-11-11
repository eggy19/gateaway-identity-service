import { RoleScope } from '../enums/role-scope.enum';
import type { EffectiveGrantRow } from '../repositories/user-role.repository';
import { ActiveContextService, jwtPermissions, jwtRoles } from './active-context.service';

const d = (iso: string) => new Date(iso);

function setup(opts: {
  assignments?: Array<{ id: string; branchId: string; isPrimary: boolean; createdAt: Date }>;
  branches?: Array<Record<string, unknown>>;
  tenants?: Array<Record<string, unknown>>;
  grants?: EffectiveGrantRow[];
}) {
  const findByUser = jest.fn().mockResolvedValue(opts.assignments ?? []);
  const findBranches = jest.fn().mockResolvedValue(opts.branches ?? []);
  const findTenants = jest.fn().mockResolvedValue(opts.tenants ?? []);
  const findGrants = jest.fn().mockResolvedValue(opts.grants ?? []);
  const service = new ActiveContextService(
    { findByUser } as never,
    { findByIdsWithDeleted: findBranches } as never,
    { findByIdsWithDeleted: findTenants } as never,
    { findEffectiveGrants: findGrants } as never,
  );
  return { service, findGrants, findBranches, findTenants };
}

const branch = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  tenantId: 't1',
  name: 'Cabang Pusat',
  code: 'MAIN',
  status: 'active',
  deletedAt: null,
  ...over,
});
const tenant = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Apotek Sehat',
  code: 'APT-001',
  status: 'active',
  deletedAt: null,
  ...over,
});
const primary = { id: 'ub1', branchId: 'b1', isPrimary: true, createdAt: d('2026-01-01') };
const g = (
  roleCode: string,
  permissionCode: string | null,
  roleScope: RoleScope = RoleScope.Branch,
): EffectiveGrantRow => ({ roleCode, roleScope, permissionCode });

describe('ActiveContextService', () => {
  it('resolves context, merged roles and sorted unique permissions (AC-D1B-02)', async () => {
    const { service, findGrants } = setup({
      assignments: [primary],
      branches: [branch()],
      tenants: [tenant()],
      grants: [
        g('OWNER', 'inventory.item.read'),
        g('APOTEKER', 'inventory.item.read'),
        g('APOTEKER', 'billing.sale.create'),
        g('OWNER', null),
        g('SUPER_ADMIN', 'identity.tenant.create', RoleScope.Platform),
      ],
    });
    const ctx = await service.resolve('u1');
    expect(findGrants).toHaveBeenCalledWith('u1', 't1', 'b1');
    expect(ctx.context).toEqual({
      tenantId: 't1',
      tenantName: 'Apotek Sehat',
      tenantCode: 'APT-001',
      branchId: 'b1',
      branchName: 'Cabang Pusat',
      branchCode: 'MAIN',
      status: 'active',
    });
    expect(ctx.roles).toEqual(['APOTEKER', 'OWNER', 'SUPER_ADMIN']);
    expect(ctx.platformRoles).toEqual(['SUPER_ADMIN']);
    expect(ctx.permissions).toEqual([
      'billing.sale.create',
      'identity.tenant.create',
      'inventory.item.read',
    ]);
    expect(ctx.branches).toEqual([{ branchId: 'b1', branchName: 'Cabang Pusat', isPrimary: true }]);
  });

  it('JWT helpers: roles drop PLATFORM; permissions only for the service prefix (AC-D1B-05)', async () => {
    const { service } = setup({
      assignments: [primary],
      branches: [branch()],
      tenants: [tenant()],
      grants: [
        g('OWNER', 'inventory.item.read'),
        g('OWNER', 'inventoryx.other.read'),
        g('OWNER', 'billing.sale.create'),
        g('SUPER_ADMIN', 'identity.tenant.create', RoleScope.Platform),
      ],
    });
    const ctx = await service.resolve('u1');
    expect(jwtRoles(ctx)).toEqual(['OWNER']);
    expect(jwtPermissions(ctx, 'inventory')).toEqual(['inventory.item.read']);
    expect(jwtPermissions(ctx, 'billing')).toEqual(['billing.sale.create']);
    expect(jwtPermissions(ctx, 'identity')).toEqual(['identity.tenant.create']);
  });

  it('no assignment -> context null, empty branches, grants queried with null scope', async () => {
    const { service, findGrants, findBranches } = setup({});
    const ctx = await service.resolve('u1');
    expect(ctx.context).toBeNull();
    expect(ctx.branches).toEqual([]);
    expect(findBranches).toHaveBeenCalledWith([]);
    expect(findGrants).toHaveBeenCalledWith('u1', null, null);
  });

  it('BR-D1B-01 / AC-D1B-03: primary branch wins over older non-primary assignment', async () => {
    const other = { id: 'ub0', branchId: 'b0', isPrimary: false, createdAt: d('2025-01-01') };
    const { service, findGrants } = setup({
      assignments: [other, primary],
      branches: [branch(), branch({ id: 'b0', name: 'Cabang Q' })],
      tenants: [tenant()],
    });
    const ctx = await service.resolve('u1');
    expect(findGrants).toHaveBeenCalledWith('u1', 't1', 'b1');
    expect(ctx.branches).toEqual([
      { branchId: 'b0', branchName: 'Cabang Q', isPrimary: false },
      { branchId: 'b1', branchName: 'Cabang Pusat', isPrimary: true },
    ]);
  });

  it('falls back to the oldest assignment when none is primary', async () => {
    const a = { id: 'a', branchId: 'b1', isPrimary: false, createdAt: d('2026-02-01') };
    const b = { id: 'b', branchId: 'b0', isPrimary: false, createdAt: d('2026-01-01') };
    const { service, findGrants } = setup({
      assignments: [a, b],
      branches: [branch(), branch({ id: 'b0' })],
      tenants: [tenant()],
    });
    await service.resolve('u1');
    expect(findGrants).toHaveBeenCalledWith('u1', 't1', 'b0');
  });

  it.each([
    ['tenant inactive', { tenants: [tenant({ status: 'inactive' })] }, 'tenant_inactive'],
    [
      'tenant soft-deleted',
      { tenants: [tenant({ deletedAt: d('2026-03-01') })] },
      'tenant_inactive',
    ],
    ['tenant missing', { tenants: [] }, 'tenant_inactive'],
    ['branch inactive', { branches: [branch({ status: 'inactive' })] }, 'branch_inactive'],
    [
      'branch soft-deleted',
      { branches: [branch({ deletedAt: d('2026-03-01') })] },
      'branch_inactive',
    ],
  ])('G4 / AC-D1B-06: %s -> context.status', async (_label, over, expected) => {
    const { service } = setup({
      assignments: [primary],
      branches: [branch()],
      tenants: [tenant()],
      ...over,
    });
    const ctx = await service.resolve('u1');
    expect(ctx.context?.status).toBe(expected);
  });

  it('soft-deleted branch is hidden from `branches` list', async () => {
    const { service } = setup({
      assignments: [primary],
      branches: [branch({ deletedAt: d('2026-03-01') })],
      tenants: [tenant()],
    });
    const ctx = await service.resolve('u1');
    expect(ctx.branches).toEqual([]);
  });
});
