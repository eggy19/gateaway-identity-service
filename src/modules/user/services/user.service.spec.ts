import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import type { AuthInstance } from '../../../shared/auth/better-auth';
import { BranchService } from '../../branch/services/branch.service';
import { TenantService } from '../../tenant/services/tenant.service';
import { UserBranchEntity } from '../entities/user-branch.entity';
import { UserSecurityEntity } from '../entities/user-security.entity';
import { UserRepository } from '../repositories/user.repository';
import { UserBranchRepository } from '../repositories/user-branch.repository';
import { UserSecurityRepository } from '../repositories/user-security.repository';
import { UserSecurityService } from './user-security.service';
import { UserService } from './user.service';

describe('UserService', () => {
  let signUpEmail: jest.Mock;
  let userRepository: jest.Mocked<Pick<UserRepository, 'existsByEmail' | 'findById'>>;
  let userSecurityRepository: jest.Mocked<Pick<UserSecurityRepository, 'create' | 'save'>>;
  let userBranchRepository: jest.Mocked<Pick<UserBranchRepository, 'create' | 'save'>>;
  let userSecurityService: jest.Mocked<Pick<UserSecurityService, 'isLocked'>>;
  let tenantService: jest.Mocked<Pick<TenantService, 'findActiveByIdOrThrow'>>;
  let branchService: jest.Mocked<Pick<BranchService, 'findActiveByIdOrThrow'>>;
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction' | 'query'>>;
  let service: UserService;

  const platformActor: ActorScope = {
    userId: 'actor-1',
    tenantId: 'tenant-1',
    isPlatform: true,
    roles: ['SUPER_ADMIN'],
  };
  const adminA: ActorScope = {
    userId: 'actor-2',
    tenantId: 'tenant-1',
    isPlatform: false,
    roles: ['ADMIN'],
  };

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
    userSecurityService = { isLocked: jest.fn().mockReturnValue(false) };
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
      userSecurityService as unknown as UserSecurityService,
      tenantService as unknown as TenantService,
      branchService as unknown as BranchService,
      dataSource as unknown as DataSource,
    );
  });

  it('rejects a duplicate email before creating an auth user', async () => {
    userRepository.existsByEmail.mockResolvedValue(true);

    await expect(service.create(dto, platformActor)).rejects.toBeInstanceOf(ConflictException);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('rejects a non-platform actor creating a user in another tenant with 403 (AC-D1C-03)', async () => {
    await expect(service.create({ ...dto, tenantId: 'tenant-B' }, adminA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(signUpEmail).not.toHaveBeenCalled();
    expect(tenantService.findActiveByIdOrThrow).not.toHaveBeenCalled();
  });

  it('lets a non-platform actor create a user in their own tenant', async () => {
    const result = await service.create(dto, adminA);

    expect(result.id).toBe('user-1');
    expect(userBranchRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: 'actor-2' }),
    );
  });

  it('rejects when the branch does not belong to the tenant', async () => {
    branchService.findActiveByIdOrThrow.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'other-tenant',
    } as never);

    await expect(service.create(dto, platformActor)).rejects.toBeInstanceOf(BadRequestException);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('creates the auth user, security row and branch assignment', async () => {
    const result = await service.create(dto, platformActor);

    expect(signUpEmail).toHaveBeenCalledTimes(1);
    expect(userSecurityRepository.save).toHaveBeenCalledTimes(1);
    expect(userBranchRepository.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('user-1');
  });

  it('rolls back the auth user when the transaction fails', async () => {
    dataSource.transaction.mockRejectedValueOnce(new Error('db failure'));

    await expect(service.create(dto, platformActor)).rejects.toThrow('db failure');
    expect(dataSource.query).toHaveBeenCalledWith('DELETE FROM "user" WHERE id = $1', ['user-1']);
  });
});

describe('UserService tenant scope (BR-D1C-02/05)', () => {
  const platform: ActorScope = { userId: 'sa', tenantId: 'tA', isPlatform: true, roles: [] };
  const adminA: ActorScope = { userId: 'adm', tenantId: 'tA', isPlatform: false, roles: ['ADMIN'] };
  const user = (id: string) => ({ id, name: id, email: `${id}@x.test` });
  const branchA = { id: 'bA', tenantId: 'tA' };
  const assignment = (userId: string, branchId: string, isPrimary = true) => ({
    userId,
    branchId,
    isPrimary,
  });

  let userRepository: { findAll: jest.Mock; findById: jest.Mock };
  let userBranchRepository: {
    findAll: jest.Mock;
    findByUser: jest.Mock;
    findByBranchIds: jest.Mock;
  };
  let branchService: { findAllInScope: jest.Mock; findByIdOrThrow: jest.Mock };
  let tenantService: { findAllInScope: jest.Mock; findAll: jest.Mock };
  let service: UserService;

  beforeEach(() => {
    userRepository = {
      findAll: jest.fn().mockResolvedValue([user('uA'), user('uB'), user('uNone')]),
      findById: jest.fn((id: string) => Promise.resolve(user(id))),
    };
    userBranchRepository = {
      findAll: jest
        .fn()
        .mockResolvedValue([
          assignment('uA', 'bA'),
          assignment('uB', 'bB'),
          assignment('uMulti', 'bB'),
        ]),
      findByUser: jest.fn((id: string) =>
        Promise.resolve(id === 'uA' ? [assignment('uA', 'bA')] : [assignment(id, 'bB')]),
      ),
      findByBranchIds: jest.fn().mockResolvedValue([assignment('uA', 'bA')]),
    };
    branchService = {
      findAllInScope: jest.fn().mockResolvedValue([branchA]),
      findByIdOrThrow: jest.fn((id: string) =>
        Promise.resolve({ id, tenantId: id === 'bA' ? 'tA' : 'tB' }),
      ),
    };
    tenantService = {
      findAllInScope: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    };
    service = new UserService(
      {} as unknown as AuthInstance,
      userRepository as unknown as UserRepository,
      {
        findAll: jest.fn().mockResolvedValue([]),
        findByUserId: jest.fn().mockResolvedValue(null),
      } as unknown as UserSecurityRepository,
      userBranchRepository as unknown as UserBranchRepository,
      { isLocked: jest.fn().mockReturnValue(false) } as unknown as UserSecurityService,
      tenantService as unknown as TenantService,
      branchService as unknown as BranchService,
      {} as unknown as DataSource,
    );
  });

  it('lists only users with a user_branch in the actor tenant (AC-D1C-01)', async () => {
    const result = await service.findAllWithContext(adminA);

    expect(branchService.findAllInScope).toHaveBeenCalledWith(adminA);
    expect(result.map((item) => item.user.id)).toEqual(['uA']);
    expect(result[0].primaryBranch).toEqual(branchA);
  });

  it('lists every user for the platform actor', async () => {
    branchService.findAllInScope.mockResolvedValue([branchA, { id: 'bB', tenantId: 'tB' }]);

    const result = await service.findAllWithContext(platform);

    expect(result.map((item) => item.user.id)).toEqual(['uA', 'uB', 'uNone']);
  });

  it('findByIdInScopeOrThrow returns an in-scope user', async () => {
    await expect(service.findByIdInScopeOrThrow('uA', adminA)).resolves.toMatchObject({ id: 'uA' });
  });

  it('findByIdInScopeOrThrow reports a user of another tenant as 404 (AC-D1C-02)', async () => {
    await expect(service.findByIdInScopeOrThrow('uB', adminA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findByIdInScopeOrThrow lets the platform see any existing user', async () => {
    await expect(service.findByIdInScopeOrThrow('uB', platform)).resolves.toMatchObject({
      id: 'uB',
    });
    expect(userBranchRepository.findByUser).not.toHaveBeenCalled();
  });

  it('findDetail 404s for a user of another tenant', async () => {
    await expect(service.findDetail('uB', adminA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findUserIdsInScope is null for the platform and the tenant users otherwise', async () => {
    await expect(service.findUserIdsInScope(platform)).resolves.toBeNull();
    await expect(service.findUserIdsInScope(adminA)).resolves.toEqual(['uA']);
    expect(userBranchRepository.findByBranchIds).toHaveBeenCalledWith(['bA']);
  });
});
