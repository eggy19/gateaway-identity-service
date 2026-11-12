import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BranchService } from '../../branch/services/branch.service';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantRepository } from '../repositories/tenant.repository';
import { TenantService } from './tenant.service';

describe('TenantService', () => {
  let tenantRepository: jest.Mocked<
    Pick<TenantRepository, 'existsByCode' | 'create' | 'save' | 'findById'>
  >;
  let branchService: jest.Mocked<Pick<BranchService, 'createDefaultBranch'>>;
  let service: TenantService;

  beforeEach(() => {
    tenantRepository = {
      existsByCode: jest.fn(),
      create: jest.fn((data) => data as TenantEntity),
      save: jest.fn((entity: TenantEntity) => Promise.resolve({ ...entity, id: 'tenant-1' })),
      findById: jest.fn(),
    };
    branchService = { createDefaultBranch: jest.fn().mockResolvedValue({}) };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb({})),
    } as unknown as DataSource;

    service = new TenantService(
      tenantRepository as unknown as TenantRepository,
      dataSource,
      branchService as unknown as BranchService,
    );
  });

  describe('create', () => {
    it('rejects a duplicate tenant code', async () => {
      tenantRepository.existsByCode.mockResolvedValue(true);

      await expect(
        service.create({ name: 'Clinic', code: 'CLI' }, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tenantRepository.save).not.toHaveBeenCalled();
      expect(branchService.createDefaultBranch).not.toHaveBeenCalled();
    });

    it('creates the tenant and its default branch in one flow', async () => {
      tenantRepository.existsByCode.mockResolvedValue(false);

      const result = await service.create({ name: 'Clinic', code: 'CLI' }, 'user-1');

      expect(result.id).toBe('tenant-1');
      expect(tenantRepository.save).toHaveBeenCalledTimes(1);
      expect(branchService.createDefaultBranch).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tenant-1' }),
        'user-1',
        expect.anything(),
      );
    });
  });

  describe('tenant scope (BR-D1C-02/03/05)', () => {
    const platform = { userId: 'sa', tenantId: 'tA', isPlatform: true, roles: [] };
    const owner = { userId: 'own', tenantId: 'tA', isPlatform: false, roles: ['OWNER'] };

    it('non-platform actor lists only their own tenant (AC-D1C-06)', async () => {
      const tenantA = { id: 'tA' } as TenantEntity;
      tenantRepository.findById.mockResolvedValue(tenantA);
      const findAll = jest.fn();
      (tenantRepository as unknown as { findAll: jest.Mock }).findAll = findAll;

      await expect(service.findAllInScope(owner)).resolves.toEqual([tenantA]);
      expect(tenantRepository.findById).toHaveBeenCalledWith('tA');
      expect(findAll).not.toHaveBeenCalled();
    });

    it('platform actor lists every tenant', async () => {
      const all = [{ id: 'tA' }, { id: 'tB' }] as TenantEntity[];
      (tenantRepository as unknown as { findAll: jest.Mock }).findAll = jest
        .fn()
        .mockResolvedValue(all);

      await expect(service.findAllInScope(platform)).resolves.toEqual(all);
    });

    it('non-platform actor without an active tenant sees nothing', async () => {
      await expect(service.findAllInScope({ ...owner, tenantId: null })).resolves.toEqual([]);
    });

    it('another tenant is 404 for a non-platform actor, without touching the database', async () => {
      await expect(service.findByIdInScopeOrThrow('tB', owner)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tenantRepository.findById).not.toHaveBeenCalled();
    });

    it('own tenant and (for platform) any tenant are returned', async () => {
      tenantRepository.findById.mockResolvedValue({ id: 'x' } as TenantEntity);

      await expect(service.findByIdInScopeOrThrow('tA', owner)).resolves.toMatchObject({ id: 'x' });
      await expect(service.findByIdInScopeOrThrow('tB', platform)).resolves.toMatchObject({
        id: 'x',
      });
    });

    it('update is scope-checked: another tenant is 404 and nothing is saved', async () => {
      await expect(service.update('tB', { name: 'x' }, owner)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tenantRepository.save).not.toHaveBeenCalled();
    });

    it('update by the platform saves and records the actor id', async () => {
      tenantRepository.findById.mockResolvedValue({ id: 'tB', name: 'old' } as TenantEntity);

      await service.update('tB', { name: 'new' }, platform);

      expect(tenantRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'new', updatedBy: 'sa' }),
      );
    });

    it('lockByIds locks the tenants in sorted order through the repository', async () => {
      const lockByIds = jest.fn().mockResolvedValue(undefined);
      (tenantRepository as unknown as { lockByIds: jest.Mock }).lockByIds = lockByIds;
      const manager = {} as never;

      await service.lockByIds(['b', 'a'], manager);

      expect(lockByIds).toHaveBeenCalledWith(['a', 'b'], manager);
    });
  });

  describe('findByIdOrThrow', () => {
    it('throws when the tenant does not exist', async () => {
      tenantRepository.findById.mockResolvedValue(null);

      await expect(service.findByIdOrThrow('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
