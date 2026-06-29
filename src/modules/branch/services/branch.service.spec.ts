import { BadRequestException, ConflictException } from '@nestjs/common';
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
});
