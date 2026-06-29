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

  describe('findByIdOrThrow', () => {
    it('throws when the tenant does not exist', async () => {
      tenantRepository.findById.mockResolvedValue(null);

      await expect(service.findByIdOrThrow('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
