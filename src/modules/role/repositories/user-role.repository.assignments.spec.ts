import { IsNull } from 'typeorm';
import { UserRoleRepository } from './user-role.repository';

/** Query-builder stub recording every call (SQL fragments + params). */
function setup(raw: { count?: string; affected?: number } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const qb: Record<string, unknown> = {};
  for (const method of [
    'select',
    'innerJoin',
    'innerJoinAndSelect',
    'withDeleted',
    'where',
    'andWhere',
    'update',
    'set',
  ]) {
    qb[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return qb;
    };
  }
  qb.getRawOne = () => Promise.resolve(raw.count === undefined ? undefined : { count: raw.count });
  qb.execute = () => Promise.resolve({ affected: raw.affected });
  qb.getOne = () => Promise.resolve(null);
  const find = jest.fn().mockResolvedValue([]);
  const findOne = jest.fn().mockResolvedValue(null);
  const exists = jest.fn().mockResolvedValue(true);
  const txRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb), findOne, exists };
  const manager = { getRepository: jest.fn().mockReturnValue(txRepo) };
  const repo = new UserRoleRepository({
    find,
    findOne,
    exists,
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as never);
  const of = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);
  return { repo, of, find, findOne, exists, manager, txRepo };
}

describe('UserRoleRepository assignment queries (T-22)', () => {
  it('findByUser: live rows only by default, newest first, role loaded', async () => {
    const { repo, find } = setup();

    await repo.findByUser('u1', { includeRevoked: false });

    expect(find).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      relations: { role: true },
      withDeleted: false,
      order: { createdAt: 'DESC' },
    });
  });

  it('findByUser: includeRevoked widens to soft-deleted rows; tenantId narrows the tenant', async () => {
    const { repo, find } = setup();

    await repo.findByUser('u1', { includeRevoked: true, tenantId: 'tA' });

    expect(find).toHaveBeenCalledWith({
      where: { userId: 'u1', tenantId: 'tA' },
      relations: { role: true },
      withDeleted: true,
      order: { createdAt: 'DESC' },
    });
  });

  it('findLiveById joins the role even when soft-deleted, but only a live assignment', async () => {
    const { repo, of, manager, txRepo } = setup();

    await repo.findLiveById('a1', manager as never);

    expect(manager.getRepository).toHaveBeenCalledTimes(1);
    expect(txRepo.createQueryBuilder).toHaveBeenCalledWith('ur');
    expect(of('withDeleted')).toHaveLength(1);
    expect(of('innerJoinAndSelect')).toEqual([['ur.role', 'r']]);
    expect(of('where')).toEqual([['ur.id = :id', { id: 'a1' }]]);
    expect(of('andWhere')).toEqual([['ur.deletedAt IS NULL']]);
  });

  it('existsLive matches branch NULL for PLATFORM roles and the branch otherwise', async () => {
    const { repo, exists } = setup();

    await repo.existsLive('u1', 'r1', 'P');
    await repo.existsLive('u1', 'r1', null);

    expect(exists).toHaveBeenNthCalledWith(1, {
      where: { userId: 'u1', roleId: 'r1', branchId: 'P' },
    });
    expect(exists).toHaveBeenNthCalledWith(2, {
      where: { userId: 'u1', roleId: 'r1', branchId: IsNull() },
    });
  });

  it('countOtherActiveOwnerAssignments counts live OWNER rows of ACTIVE users, excluding one row', async () => {
    const { repo, of, manager, txRepo } = setup({ count: '2' });

    await expect(repo.countOtherActiveOwnerAssignments('tA', 'a1', manager as never)).resolves.toBe(
      2,
    );

    expect(txRepo.createQueryBuilder).toHaveBeenCalledWith('ur');
    expect(of('select')).toEqual([['COUNT(ur.id)', 'count']]);
    expect(of('innerJoin').map((a) => a.slice(1))).toEqual([
      ['r', 'r.id = ur.roleId AND r.deletedAt IS NULL AND r.code = :owner', { owner: 'OWNER' }],
      ['u', 'u.id = ur.userId AND u.status = :active', { active: 'active' }],
    ]);
    expect(of('where')).toEqual([['ur.tenantId = :tenantId', { tenantId: 'tA' }]]);
    expect(of('andWhere')).toEqual([
      ['ur.id <> :excludeAssignmentId', { excludeAssignmentId: 'a1' }],
      ['ur.deletedAt IS NULL'],
    ]);
  });

  it('countOtherActiveOwnerAssignments is 0 when the query returns no row', async () => {
    const { repo } = setup();

    await expect(repo.countOtherActiveOwnerAssignments('tA', 'a1')).resolves.toBe(0);
  });

  it('softRevoke only sets deleted_at/by and updated_by, guarded by deleted_at IS NULL', async () => {
    const { repo, of, manager } = setup({ affected: 1 });

    await expect(repo.softRevoke('a1', 'actor', manager as never)).resolves.toBe(1);

    expect(of('update')).toHaveLength(1);
    const [set] = of('set')[0] as [Record<string, unknown>];
    expect(Object.keys(set).sort()).toEqual(['deletedAt', 'deletedBy', 'updatedBy']);
    expect(set.deletedBy).toBe('actor');
    expect(set.updatedBy).toBe('actor');
    expect((set.deletedAt as () => string)()).toBe('now()');
    expect(of('where')).toEqual([['id = :id AND deleted_at IS NULL', { id: 'a1' }]]);
  });

  it('softRevoke reports 0 rows when nothing was affected', async () => {
    const { repo } = setup({});

    await expect(repo.softRevoke('a1', 'actor')).resolves.toBe(0);
  });
});
