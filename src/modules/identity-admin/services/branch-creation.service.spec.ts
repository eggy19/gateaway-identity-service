import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { BranchService } from '../../branch/services/branch.service';
import { UserRoleRepository } from '../../role/repositories/user-role.repository';
import { UserBranchRepository } from '../../user/repositories/user-branch.repository';
import { BranchCreationService } from './branch-creation.service';

describe('BranchCreationService (KP-22, BR-D1D-10)', () => {
  const manager = { tx: true };
  const dto = { tenantId: 'tA', name: 'Cabang 2', code: 'C2' };
  const owner: ActorScope = { userId: 'own', tenantId: 'tA', isPlatform: false, roles: ['OWNER'] };
  const admin: ActorScope = { userId: 'adm', tenantId: 'tA', isPlatform: false, roles: ['ADMIN'] };
  const platformOwner: ActorScope = {
    userId: 'sa',
    tenantId: 'tA',
    isPlatform: true,
    roles: ['OWNER', 'SUPER_ADMIN'],
  };

  let branchService: { create: jest.Mock };
  let userBranchRepository: { create: jest.Mock; save: jest.Mock };
  let userRoleRepository: { findSystemRoleId: jest.Mock; create: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: BranchCreationService;

  beforeEach(() => {
    branchService = {
      create: jest.fn().mockResolvedValue({ id: 'newBranch', tenantId: 'tA' }),
    };
    userBranchRepository = {
      create: jest.fn((d: unknown) => d),
      save: jest.fn().mockResolvedValue(undefined),
    };
    userRoleRepository = {
      findSystemRoleId: jest.fn().mockResolvedValue('ownerRoleId'),
      create: jest.fn((d: unknown) => d),
      save: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
    service = new BranchCreationService(
      branchService as unknown as BranchService,
      userBranchRepository as unknown as UserBranchRepository,
      userRoleRepository as unknown as UserRoleRepository,
      dataSource as unknown as DataSource,
    );
  });

  it('OWNER gets a non-primary user_branch and an OWNER user_role in the same transaction', async () => {
    const branch = await service.create(dto, owner);

    expect(branch.id).toBe('newBranch');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(branchService.create).toHaveBeenCalledWith(dto, 'own', manager);
    expect(userBranchRepository.create).toHaveBeenCalledWith({
      userId: 'own',
      branchId: 'newBranch',
      isPrimary: false,
      createdBy: 'own',
      updatedBy: 'own',
    });
    expect(userBranchRepository.save).toHaveBeenCalledWith(expect.anything(), manager);
    expect(userRoleRepository.findSystemRoleId).toHaveBeenCalledWith('OWNER', manager);
    expect(userRoleRepository.create).toHaveBeenCalledWith({
      userId: 'own',
      roleId: 'ownerRoleId',
      tenantId: 'tA',
      branchId: 'newBranch',
      createdBy: 'own',
      updatedBy: 'own',
    });
    expect(userRoleRepository.save).toHaveBeenCalledWith(expect.anything(), manager);
  });

  it('a non-OWNER (ADMIN) creates the branch without any grant', async () => {
    await service.create(dto, admin);

    expect(branchService.create).toHaveBeenCalled();
    expect(userBranchRepository.save).not.toHaveBeenCalled();
    expect(userRoleRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a non-platform actor creating a branch in another tenant with 403', async () => {
    await expect(service.create({ ...dto, tenantId: 'tB' }, owner)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('platform actor creating a branch in another tenant does not become OWNER there', async () => {
    branchService.create.mockResolvedValue({ id: 'bB', tenantId: 'tB' });

    await service.create({ ...dto, tenantId: 'tB' }, platformOwner);

    expect(userBranchRepository.save).not.toHaveBeenCalled();
    expect(userRoleRepository.save).not.toHaveBeenCalled();
  });

  it('platform OWNER creating in their own active tenant is granted OWNER', async () => {
    await service.create(dto, platformOwner);

    expect(userRoleRepository.save).toHaveBeenCalledTimes(1);
  });

  it('fails (rolling back) when the OWNER system role is missing', async () => {
    userRoleRepository.findSystemRoleId.mockResolvedValue(null);

    await expect(service.create(dto, owner)).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(userRoleRepository.save).not.toHaveBeenCalled();
  });
});
