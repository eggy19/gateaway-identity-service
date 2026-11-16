import { RoleRepository } from './role.repository';

/** Records every query-builder call so the generated SQL fragments and params can be asserted. */
function setup() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const qb: Record<string, unknown> = {};
  for (const method of ['where', 'andWhere', 'innerJoin', 'orderBy']) {
    qb[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return qb;
    };
  }
  qb.getMany = () => Promise.resolve([]);
  qb.getOne = () => Promise.resolve(null);
  const roleQb = jest.fn().mockReturnValue(qb);
  const permissionQb = jest.fn().mockReturnValue(qb);
  const repo = new RoleRepository(
    { createQueryBuilder: roleQb } as never,
    { createQueryBuilder: permissionQb } as never,
  );
  const of = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);
  return { repo, of, roleQb, permissionQb };
}

describe('RoleRepository (§8.4, BR-D1D-11)', () => {
  it('platform sees every live role: no tenant or scope filter', async () => {
    const { repo, of, roleQb } = setup();

    await repo.findVisible({ platform: true });

    expect(roleQb).toHaveBeenCalledWith('r');
    expect(of('where')).toEqual([['r.deletedAt IS NULL']]);
    expect(of('andWhere')).toEqual([]);
    expect(of('orderBy')).toEqual([['r.code', 'ASC']]);
  });

  it('a non-platform actor sees system + own-tenant roles and never PLATFORM scope', async () => {
    const { repo, of } = setup();

    await repo.findVisible({ platform: false, tenantId: 'tA' });

    expect(of('where')).toEqual([['r.deletedAt IS NULL']]);
    expect(of('andWhere')).toEqual([
      ['(r.tenantId IS NULL OR r.tenantId = :tenantId)', { tenantId: 'tA' }],
      ['r.scope <> :platformScope', { platformScope: 'PLATFORM' }],
    ]);
  });

  it('findVisibleById applies the same visibility plus the id', async () => {
    const { repo, of } = setup();

    await repo.findVisibleById('r1', { platform: false, tenantId: 'tA' });

    expect(of('andWhere')).toEqual([
      ['(r.tenantId IS NULL OR r.tenantId = :tenantId)', { tenantId: 'tA' }],
      ['r.scope <> :platformScope', { platformScope: 'PLATFORM' }],
      ['r.id = :id', { id: 'r1' }],
    ]);
  });

  it('findPermissionsOfRole joins only live role_permission rows of the role', async () => {
    const { repo, of, permissionQb } = setup();

    await repo.findPermissionsOfRole('r1');

    expect(permissionQb).toHaveBeenCalledWith('p');
    expect(of('innerJoin').map((a) => a.slice(1))).toEqual([
      ['rp', 'rp.permissionId = p.id AND rp.deletedAt IS NULL'],
    ]);
    expect(of('where')).toEqual([['rp.roleId = :roleId', { roleId: 'r1' }]]);
    expect(of('orderBy')).toEqual([['p.code', 'ASC']]);
  });

  it('findAllPermissions hides platform-only permissions from non-platform actors', async () => {
    const { repo, of } = setup();

    await repo.findAllPermissions(false);

    expect(of('where')).toEqual([['p.deletedAt IS NULL']]);
    expect(of('andWhere')).toEqual([['p.isPlatform = :isPlatform', { isPlatform: false }]]);
  });

  it('findAllPermissions returns everything for the platform', async () => {
    const { repo, of } = setup();

    await repo.findAllPermissions(true);

    expect(of('andWhere')).toEqual([]);
  });
});
