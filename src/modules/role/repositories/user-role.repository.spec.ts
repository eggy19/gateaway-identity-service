import { UserRoleRepository } from './user-role.repository';

/** Records every query-builder call so the generated SQL fragments and params can be asserted. */
function setup(rows: unknown[] = []) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const qb: Record<string, unknown> = {};
  for (const method of ['select', 'addSelect', 'innerJoin', 'leftJoin', 'where', 'andWhere']) {
    qb[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return qb;
    };
  }
  qb.getRawMany = () => Promise.resolve(rows);
  const createQueryBuilder = jest.fn().mockReturnValue(qb);
  const repo = new UserRoleRepository({ createQueryBuilder } as never);
  return { repo, calls, createQueryBuilder };
}

/** Query-builder stub that also supports `getRawOne`, plus an optional transaction manager. */
function setupRaw(rows: unknown[] = [], one: unknown = undefined) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const qb: Record<string, unknown> = {};
  for (const method of ['select', 'addSelect', 'innerJoin', 'where', 'andWhere']) {
    qb[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return qb;
    };
  }
  qb.getRawMany = () => Promise.resolve(rows);
  qb.getRawOne = () => Promise.resolve(one);
  const txQb = jest.fn().mockReturnValue(qb);
  const manager = { getRepository: jest.fn().mockReturnValue({ createQueryBuilder: txQb }) };
  const repo = new UserRoleRepository({
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as never);
  return { repo, calls, manager, txQb };
}

describe('UserRoleRepository RBAC guards (KP-33, BR-D1D-03)', () => {
  it('findHeldRoleCodes selects live role codes of the user within the given codes', async () => {
    const { repo, calls, manager, txQb } = setupRaw([
      { role_code: 'OWNER' },
      { role_code: 'ADMIN' },
    ]);

    await expect(
      repo.findHeldRoleCodes('u1', ['OWNER', 'ADMIN', 'SUPER_ADMIN'], manager as never),
    ).resolves.toEqual(['OWNER', 'ADMIN']);

    expect(txQb).toHaveBeenCalledWith('ur');
    expect(calls.find((c) => c.method === 'select')?.args).toEqual([
      'DISTINCT r.code',
      'role_code',
    ]);
    expect(calls.find((c) => c.method === 'innerJoin')?.args.slice(1)).toEqual([
      'r',
      'r.id = ur.roleId AND r.deletedAt IS NULL',
    ]);
    expect(calls.find((c) => c.method === 'where')?.args).toEqual([
      'ur.userId = :userId',
      { userId: 'u1' },
    ]);
    const ands = calls.filter((c) => c.method === 'andWhere').map((c) => c.args);
    expect(ands).toEqual([
      ['ur.deletedAt IS NULL'],
      ['r.code IN (:...codes)', { codes: ['OWNER', 'ADMIN', 'SUPER_ADMIN'] }],
    ]);
  });

  it('findOwnerTenantIds selects tenants of live OWNER assignments with a tenant', async () => {
    const { repo, calls } = setupRaw([{ tenant_id: 't1' }, { tenant_id: 't2' }]);

    await expect(repo.findOwnerTenantIds('u1')).resolves.toEqual(['t1', 't2']);

    expect(calls.find((c) => c.method === 'select')?.args).toEqual([
      'DISTINCT ur.tenantId',
      'tenant_id',
    ]);
    expect(calls.find((c) => c.method === 'innerJoin')?.args.slice(1)).toEqual([
      'r',
      'r.id = ur.roleId AND r.deletedAt IS NULL AND r.code = :owner',
      { owner: 'OWNER' },
    ]);
    expect(calls.filter((c) => c.method === 'andWhere').map((c) => c.args[0])).toEqual([
      'ur.deletedAt IS NULL',
      'ur.tenantId IS NOT NULL',
    ]);
  });

  it('countOtherActiveOwners counts distinct active OWNER users of the tenant except one', async () => {
    const { repo, calls, manager } = setupRaw([], { count: '2' });

    await expect(repo.countOtherActiveOwners('t1', 'u1', manager as never)).resolves.toBe(2);

    expect(calls.find((c) => c.method === 'select')?.args).toEqual([
      'COUNT(DISTINCT ur.userId)',
      'count',
    ]);
    const joins = calls.filter((c) => c.method === 'innerJoin').map((c) => c.args.slice(1));
    expect(joins[0]).toEqual([
      'r',
      'r.id = ur.roleId AND r.deletedAt IS NULL AND r.code = :owner',
      { owner: 'OWNER' },
    ]);
    expect(joins[1]).toEqual([
      'u',
      'u.id = ur.userId AND u.status = :active',
      { active: 'active' },
    ]);
    expect(calls.find((c) => c.method === 'where')?.args).toEqual([
      'ur.tenantId = :tenantId',
      { tenantId: 't1' },
    ]);
    expect(calls.filter((c) => c.method === 'andWhere').map((c) => c.args)).toEqual([
      ['ur.userId <> :excludeUserId', { excludeUserId: 'u1' }],
      ['ur.deletedAt IS NULL'],
    ]);
  });

  it('countOtherActiveOwners returns 0 when there is no row', async () => {
    const { repo } = setupRaw([], undefined);
    await expect(repo.countOtherActiveOwners('t1', 'u1')).resolves.toBe(0);
  });
});

describe('UserRoleRepository.findEffectiveGrants (BR-D1B-10)', () => {
  it('filters soft delete, role status and scope consistency with bound params', async () => {
    const { repo, calls, createQueryBuilder } = setup();
    await repo.findEffectiveGrants('u1', 't1', 'b1');

    expect(createQueryBuilder).toHaveBeenCalledWith('ur');
    const roleJoin = calls.find((c) => c.method === 'innerJoin');
    expect(roleJoin?.args[1]).toBe('r');
    expect(roleJoin?.args[2]).toBe(
      'r.id = ur.roleId AND r.deletedAt IS NULL AND r.status = :active',
    );
    expect(roleJoin?.args[3]).toEqual({ active: 'active' });

    const joins = calls.filter((c) => c.method === 'leftJoin').map((c) => c.args[2]);
    expect(joins).toEqual([
      'rp.roleId = r.id AND rp.deletedAt IS NULL',
      'p.id = rp.permissionId AND p.deletedAt IS NULL',
    ]);

    const where = calls.find((c) => c.method === 'where');
    expect(where?.args).toEqual(['ur.userId = :userId', { userId: 'u1' }]);

    const ands = calls.filter((c) => c.method === 'andWhere');
    expect(ands[0].args[0]).toBe('ur.deletedAt IS NULL');
    expect(ands[1].args[0]).toBe(
      '((r.scope = :branchScope AND ur.branchId = :branchId AND ur.tenantId = :tenantId)' +
        ' OR (r.scope = :platformScope AND ur.tenantId IS NULL AND ur.branchId IS NULL))',
    );
    expect(ands[1].args[1]).toEqual({
      branchScope: 'BRANCH',
      platformScope: 'PLATFORM',
      branchId: 'b1',
      tenantId: 't1',
    });
  });

  it('passes null scope when the user has no active branch', async () => {
    const { repo, calls } = setup();
    await repo.findEffectiveGrants('u1', null, null);
    const scope = calls.filter((c) => c.method === 'andWhere')[1].args[1];
    expect(scope).toMatchObject({ branchId: null, tenantId: null });
  });

  it('maps raw rows to camelCase grants', async () => {
    const { repo } = setup([
      { role_code: 'KASIR', role_scope: 'BRANCH', permission_code: 'billing.sale.create' },
      { role_code: 'EMPTY', role_scope: 'BRANCH', permission_code: null },
    ]);
    await expect(repo.findEffectiveGrants('u1', 't1', 'b1')).resolves.toEqual([
      { roleCode: 'KASIR', roleScope: 'BRANCH', permissionCode: 'billing.sale.create' },
      { roleCode: 'EMPTY', roleScope: 'BRANCH', permissionCode: null },
    ]);
  });
});
