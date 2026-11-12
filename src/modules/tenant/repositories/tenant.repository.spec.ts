import { TenantEntity } from '../entities/tenant.entity';
import { TenantRepository } from './tenant.repository';

describe('TenantRepository.lockByIds (BR-D1D-03)', () => {
  function setup() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const qb: Record<string, unknown> = {};
    for (const method of ['select', 'where', 'orderBy', 'setLock']) {
      qb[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return qb;
      };
    }
    qb.getMany = () => Promise.resolve([]);
    const createQueryBuilder = jest.fn().mockReturnValue(qb);
    const getRepository = jest.fn().mockReturnValue({ createQueryBuilder });
    const repo = new TenantRepository({} as never);
    return { repo, calls, createQueryBuilder, manager: { getRepository } };
  }

  it('selects the tenant ids FOR UPDATE on the transaction manager with bound params', async () => {
    const { repo, calls, createQueryBuilder, manager } = setup();

    await repo.lockByIds(['a', 'b'], manager as never);

    expect(manager.getRepository).toHaveBeenCalledWith(TenantEntity);
    expect(createQueryBuilder).toHaveBeenCalledWith('tenant');
    expect(calls.find((c) => c.method === 'where')?.args).toEqual([
      'tenant.id IN (:...ids)',
      { ids: ['a', 'b'] },
    ]);
    expect(calls.find((c) => c.method === 'orderBy')?.args).toEqual(['tenant.id', 'ASC']);
    expect(calls.find((c) => c.method === 'setLock')?.args).toEqual(['pessimistic_write']);
  });

  it('does nothing for an empty id list', async () => {
    const { repo, createQueryBuilder, manager } = setup();

    await repo.lockByIds([], manager as never);

    expect(createQueryBuilder).not.toHaveBeenCalled();
  });
});
