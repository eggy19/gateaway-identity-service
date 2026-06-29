import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthInstance } from '../../../shared/auth/better-auth';
import { BranchService } from '../../branch/services/branch.service';
import { TenantService } from '../../tenant/services/tenant.service';
import { UserBranchEntity } from '../entities/user-branch.entity';
import { UserSecurityEntity } from '../entities/user-security.entity';
import { UserRepository } from '../repositories/user.repository';
import { UserBranchRepository } from '../repositories/user-branch.repository';
import { UserSecurityRepository } from '../repositories/user-security.repository';
import { UserService } from './user.service';

describe('UserService', () => {
  let signUpEmail: jest.Mock;
  let userRepository: jest.Mocked<Pick<UserRepository, 'existsByEmail' | 'findById'>>;
  let userSecurityRepository: jest.Mocked<Pick<UserSecurityRepository, 'create' | 'save'>>;
  let userBranchRepository: jest.Mocked<Pick<UserBranchRepository, 'create' | 'save'>>;
  let tenantService: jest.Mocked<Pick<TenantService, 'findActiveByIdOrThrow'>>;
  let branchService: jest.Mocked<Pick<BranchService, 'findActiveByIdOrThrow'>>;
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction' | 'query'>>;
  let service: UserService;

  const dto = {
    email: 'a@b.com',
    password: 'password123',
    name: 'Alice',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
  };

  beforeEach(() => {
    signUpEmail = jest.fn().mockResolvedValue({ user: { id: 'user-1' } });
    userRepository = {
      existsByEmail: jest.fn().mockResolvedValue(false),
      findById: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    userSecurityRepository = {
      create: jest.fn((d: Partial<UserSecurityEntity>) => d as UserSecurityEntity),
      save: jest.fn(),
    };
    userBranchRepository = {
      create: jest.fn((d: Partial<UserBranchEntity>) => d as UserBranchEntity),
      save: jest.fn(),
    };
    tenantService = { findActiveByIdOrThrow: jest.fn().mockResolvedValue({ id: 'tenant-1' }) };
    branchService = {
      findActiveByIdOrThrow: jest.fn().mockResolvedValue({ id: 'branch-1', tenantId: 'tenant-1' }),
    };
    dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb({})),
      query: jest.fn(),
    } as unknown as jest.Mocked<Pick<DataSource, 'transaction' | 'query'>>;

    service = new UserService(
      { api: { signUpEmail } } as unknown as AuthInstance,
      userRepository as unknown as UserRepository,
      userSecurityRepository as unknown as UserSecurityRepository,
      userBranchRepository as unknown as UserBranchRepository,
      tenantService as unknown as TenantService,
      branchService as unknown as BranchService,
      dataSource as unknown as DataSource,
    );
  });

  it('rejects a duplicate email before creating an auth user', async () => {
    userRepository.existsByEmail.mockResolvedValue(true);

    await expect(service.create(dto, 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('rejects when the branch does not belong to the tenant', async () => {
    branchService.findActiveByIdOrThrow.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'other-tenant',
    } as never);

    await expect(service.create(dto, 'actor-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('creates the auth user, security row and branch assignment', async () => {
    const result = await service.create(dto, 'actor-1');

    expect(signUpEmail).toHaveBeenCalledTimes(1);
    expect(userSecurityRepository.save).toHaveBeenCalledTimes(1);
    expect(userBranchRepository.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('user-1');
  });

  it('rolls back the auth user when the transaction fails', async () => {
    dataSource.transaction.mockRejectedValueOnce(new Error('db failure'));

    await expect(service.create(dto, 'actor-1')).rejects.toThrow('db failure');
    expect(dataSource.query).toHaveBeenCalledWith('DELETE FROM "user" WHERE id = $1', ['user-1']);
  });
});
