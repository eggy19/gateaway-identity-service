import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantService } from '../../tenant/services/tenant.service';
import { BranchEntity } from '../entities/branch.entity';
import { BranchRepository } from '../repositories/branch.repository';
import { BranchService } from './branch.service';

describe('BranchService', () => {
  let branchRepository: jest.Mocked<
    Pick<BranchRepository, 'existsByTenantAndCode' | 'create' | 'save'>
  >;
  let tenantService: jest.Mocked<Pick<TenantService, 'findActiveByIdOrThrow'>>;
  let service: BranchService;

  const dto = { tenantId: 'tenant-1', name: 'Main', code: 'MAIN' };

  beforeEach(() => {
    branchRepository = {
      existsByTenantAndCode: jest.fn(),
      create: jest.fn((data) => data as BranchEntity),
      save: jest.fn((entity: BranchEntity) => Promise.resolve({ ...entity, id: 'branch-1' })),
    };
    tenantService = { findActiveByIdOrThrow: jest.fn().mockResolvedValue({ id: 'tenant-1' }) };

    service = new BranchService(
      branchRepository as unknown as BranchRepository,
      tenantService as unknown as TenantService,
    );
  });

  it('rejects creation when the tenant is not active', async () => {
    tenantService.findActiveByIdOrThrow.mockRejectedValue(new BadRequestException());

    await expect(service.create(dto, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(branchRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate branch code within the tenant', async () => {
    branchRepository.existsByTenantAndCode.mockResolvedValue(true);

    await expect(service.create(dto, 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(branchRepository.save).not.toHaveBeenCalled();
  });

  it('creates a branch after validation passes', async () => {
    branchRepository.existsByTenantAndCode.mockResolvedValue(false);

    const result = await service.create(dto, 'user-1');

    expect(tenantService.findActiveByIdOrThrow).toHaveBeenCalledWith('tenant-1');
    expect(result.id).toBe('branch-1');
  });

  it('runs the duplicate check and the save on the caller transaction manager', async () => {
    branchRepository.existsByTenantAndCode.mockResolvedValue(false);
    const manager = {} as never;

    await service.create(dto, 'user-1', manager);

    expect(branchRepository.existsByTenantAndCode).toHaveBeenCalledWith(
      'tenant-1',
      'MAIN',
      manager,
    );
    expect(branchRepository.save).toHaveBeenCalledWith(expect.anything(), manager);
  });

  describe('tenant scope (BR-D1C-02/03/05)', () => {
    const platform = { userId: 'sa', tenantId: 'tA', isPlatform: true, roles: [] };
    const admin = { userId: 'adm', tenantId: 'tA', isPlatform: false, roles: ['ADMIN'] };
    let findByTenant: jest.Mock;
    let findAll: jest.Mock;
    let findById: jest.Mock;

    beforeEach(() => {
      findByTenant = jest.fn().mockResolvedValue([{ id: 'b1' }]);
      findAll = jest.fn().mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
      findById = jest.fn().mockResolvedValue({ id: 'b1', tenantId: 'tB', name: 'n' });
      Object.assign(branchRepository, { findByTenant, findAll, findById });
    });

    it('non-platform actor always gets their tenant and ignores a foreign tenantId', async () => {
      await service.findAllInScope(admin, 'tB');

      expect(findByTenant).toHaveBeenCalledWith('tA');
      expect(findAll).not.toHaveBeenCalled();
    });

    it('non-platform actor without an active tenant gets nothing', async () => {
      await expect(service.findAllInScope({ ...admin, tenantId: null })).resolves.toEqual([]);
    });

    it('platform actor may filter by tenantId or list everything', async () => {
      await service.findAllInScope(platform, 'tB');
      expect(findByTenant).toHaveBeenCalledWith('tB');

      await service.findAllInScope(platform);
      expect(findAll).toHaveBeenCalledTimes(1);
    });

    it('a branch of another tenant is 404 for a non-platform actor, found for the platform', async () => {
      await expect(service.findByIdInScopeOrThrow('b1', admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findByIdInScopeOrThrow('b1', platform)).resolves.toMatchObject({
        id: 'b1',
      });
    });

    it('update of a branch in another tenant is 404 and saves nothing', async () => {
      await expect(service.update('b1', { name: 'x' }, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(branchRepository.save).not.toHaveBeenCalled();
    });

    it('update of an in-scope branch records the actor id', async () => {
      findById.mockResolvedValue({ id: 'b1', tenantId: 'tA', name: 'old' });

      await service.update('b1', { name: 'new' }, admin);

      expect(branchRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'new', updatedBy: 'adm' }),
      );
    });
  });
});
