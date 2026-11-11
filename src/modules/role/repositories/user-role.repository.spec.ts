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
