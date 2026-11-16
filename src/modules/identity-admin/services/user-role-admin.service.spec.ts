import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { BranchService } from '../../branch/services/branch.service';
import { RoleScope } from '../../role/enums/role-scope.enum';
import { RoleStatus } from '../../role/enums/role-status.enum';
import { UserRoleRepository } from '../../role/repositories/user-role.repository';
import { RoleService } from '../../role/services/role.service';
import { TenantService } from '../../tenant/services/tenant.service';
import { UserStatus } from '../../user/enums/user-status.enum';
import { UserService } from '../../user/services/user.service';
import { UserRoleAdminService } from './user-role-admin.service';

describe('UserRoleAdminService (T-22, BR-D1D-01..13)', () => {
  const manager = { tx: true };
  const adminA: ActorScope = { userId: 'adm', tenantId: 'tA', isPlatform: false, roles: ['ADMIN'] };
  const ownerA: ActorScope = { userId: 'own', tenantId: 'tA', isPlatform: false, roles: ['OWNER'] };
  const platform: ActorScope = {
    userId: 'sa',
    tenantId: null,
    isPlatform: true,
    roles: ['SUPER_ADMIN'],
  };

  const role = (code: string, over: Record<string, unknown> = {}) => ({
    id: `role-${code}`,
    code,
    name: code,
    scope: code === 'SUPER_ADMIN' ? RoleScope.Platform : RoleScope.Branch,
    status: RoleStatus.Active,
    ...over,
  });
  const branchP = { id: 'P', tenantId: 'tA', name: 'Cabang P' };
  const grantRows = (roles: string[], permissions: string[]) =>
    roles.flatMap((roleCode) =>
      permissions.map((permissionCode) => ({
        roleCode,
        roleScope: RoleScope.Branch,
        permissionCode,
      })),
    );
  const adminGrants = () =>
    grantRows(['ADMIN'], ['identity.user_role.assign', 'identity.user_role.revoke']);
  const ownerGrants = () =>
    grantRows(['OWNER'], ['identity.user_role.assign', 'identity.user_role.revoke']);

  let userService: {
    findByIdInScopeOrThrow: jest.Mock;
    findBranchIds: jest.Mock;
    findByIdOrThrow: jest.Mock;
  };
  let branchService: { findByIdInScopeOrThrow: jest.Mock; findByIdsWithDeleted: jest.Mock };
  let tenantService: { lockByIds: jest.Mock };
  let roleService: { findByIdOrThrow: jest.Mock };
  let repo: {
    findByUser: jest.Mock;
    findLiveById: jest.Mock;
    existsLive: jest.Mock;
    countOtherActiveOwnerAssignments: jest.Mock;
    softRevoke: jest.Mock;
    findEffectiveGrants: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let service: UserRoleAdminService;

  beforeEach(() => {
    userService = {
      findByIdInScopeOrThrow: jest.fn().mockResolvedValue({ id: 'K', status: UserStatus.Active }),
      findBranchIds: jest.fn().mockResolvedValue(['P']),
      findByIdOrThrow: jest.fn().mockResolvedValue({ id: 'K', status: UserStatus.Active }),
    };
    branchService = {
      findByIdInScopeOrThrow: jest.fn().mockResolvedValue(branchP),
      findByIdsWithDeleted: jest.fn().mockResolvedValue([branchP]),
    };
    tenantService = { lockByIds: jest.fn().mockResolvedValue(undefined) };
    roleService = { findByIdOrThrow: jest.fn().mockResolvedValue(role('KASIR')) };
    repo = {
      findByUser: jest.fn().mockResolvedValue([]),
      findLiveById: jest.fn(),
      existsLive: jest.fn().mockResolvedValue(false),
      countOtherActiveOwnerAssignments: jest.fn().mockResolvedValue(1),
      softRevoke: jest.fn().mockResolvedValue(1),
      findEffectiveGrants: jest.fn().mockResolvedValue(adminGrants()),
      create: jest.fn((data: object) => ({ ...data })),
      save: jest.fn((row: object) => Promise.resolve({ id: 'new', ...row })),
    };
    dataSource = { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
    service = new UserRoleAdminService(
      userService as unknown as UserService,
      branchService as unknown as BranchService,
      tenantService as unknown as TenantService,
      roleService as unknown as RoleService,
      repo as unknown as UserRoleRepository,
      dataSource as unknown as DataSource,
    );
  });

  describe('assign', () => {
    const dto = { roleId: 'role-KASIR', branchId: 'P' };

    it('404 for a user outside the actor tenant, before anything else (BR-D1D-11)', async () => {
      userService.findByIdInScopeOrThrow.mockRejectedValue(new NotFoundException());

      await expect(service.assign('B1', dto, adminA)).rejects.toBeInstanceOf(NotFoundException);
      expect(roleService.findByIdOrThrow).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('403 when the actor targets themselves, even as OWNER (BR-D1D-08)', async () => {
      await expect(service.assign('own', dto, ownerA)).rejects.toBeInstanceOf(ForbiddenException);
      expect(roleService.findByIdOrThrow).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('404 for an invisible role (SUPER_ADMIN for a non-platform actor)', async () => {
      roleService.findByIdOrThrow.mockRejectedValue(new NotFoundException());

      await expect(
        service.assign('K', { roleId: 'role-SUPER_ADMIN', branchId: null }, ownerA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('422 for an inactive role (BR-D1D-06)', async () => {
      roleService.findByIdOrThrow.mockResolvedValue(role('KASIR', { status: RoleStatus.Inactive }));

      await expect(service.assign('K', dto, adminA)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('422 for a PLATFORM role with a branchId (BR-D1A-06, AC-D1D-09)', async () => {
      roleService.findByIdOrThrow.mockResolvedValue(role('SUPER_ADMIN'));

      await expect(
        service.assign('K', { roleId: 'role-SUPER_ADMIN', branchId: 'P' }, platform),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.each([null, undefined])(
      '422 for a BRANCH role with branchId %s, before the branch lookup (AC-D1D-10, step 6 before 7)',
      async (branchId) => {
        await expect(
          service.assign('K', { roleId: 'role-KASIR', branchId }, ownerA),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(branchService.findByIdInScopeOrThrow).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      },
    );

    it('404 for a branch of another tenant, no row saved (AC-D1D-04)', async () => {
      branchService.findByIdInScopeOrThrow.mockRejectedValue(new NotFoundException());

      await expect(
        service.assign('K', { roleId: 'role-KASIR', branchId: 'Q' }, adminA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(branchService.findByIdInScopeOrThrow).toHaveBeenCalledWith('Q', adminA);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.each(['OWNER', 'ADMIN'])(
      'ADMIN cannot assign %s: 403 and no row (BR-D1D-02, AC-D1D-17)',
      async (code) => {
        roleService.findByIdOrThrow.mockResolvedValue(role(code));

        await expect(
          service.assign('K', { roleId: `role-${code}`, branchId: 'P' }, adminA),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(repo.save).not.toHaveBeenCalled();
      },
    );

    it('OWNER may assign ADMIN (AC-D1D-17)', async () => {
      roleService.findByIdOrThrow.mockResolvedValue(role('ADMIN'));
      repo.findEffectiveGrants.mockResolvedValue(ownerGrants());

      await expect(
        service.assign('K', { roleId: 'role-ADMIN', branchId: 'P' }, ownerA),
      ).resolves.toBeDefined();
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('authority is evaluated at the TARGET branch, not the active one (BR-D1D-09)', async () => {
      branchService.findByIdInScopeOrThrow.mockResolvedValue({
        id: 'Q',
        tenantId: 'tA',
        name: 'Cabang Q',
      });
      // At Q the actor holds no identity.user_role.assign.
      repo.findEffectiveGrants.mockResolvedValue(grantRows(['KASIR'], ['billing.sale.create']));

      await expect(
        service.assign('K', { roleId: 'role-KASIR', branchId: 'Q' }, adminA),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.findEffectiveGrants).toHaveBeenCalledWith('adm', 'tA', 'Q');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('422 when the target user has no live user_branch at the branch (AC-D1D-03/11)', async () => {
      userService.findBranchIds.mockResolvedValue(['other']);

      await expect(service.assign('K', dto, adminA)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('hierarchy 403 wins over the user_branch 422 (step 8 before 9)', async () => {
      roleService.findByIdOrThrow.mockResolvedValue(role('OWNER'));
      userService.findBranchIds.mockResolvedValue([]);

      await expect(
        service.assign('K', { roleId: 'role-OWNER', branchId: 'P' }, adminA),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('409 for a duplicate live assignment (AC-D1D-05)', async () => {
      repo.existsLive.mockResolvedValue(true);

      await expect(service.assign('K', dto, adminA)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.existsLive).toHaveBeenCalledWith('K', 'role-KASIR', 'P', manager);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.each([
      ['code', { code: '23505' }],
      ['driverError.code', { driverError: { code: '23505' } }],
    ])('race: unique violation (%s) is mapped to 409, not 500 (AC-D1D-19)', async (_n, error) => {
      repo.save.mockRejectedValue(Object.assign(new Error('duplicate key'), error));

      await expect(service.assign('K', dto, adminA)).rejects.toBeInstanceOf(ConflictException);
    });

    it('other save errors are not swallowed', async () => {
      repo.save.mockRejectedValue(new Error('boom'));

      await expect(service.assign('K', dto, adminA)).rejects.toThrow('boom');
    });

    it('saves in a transaction; tenant comes from the branch, audit from the actor (BR-D1A-06)', async () => {
      const result = await service.assign('K', dto, adminA);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(repo.create).toHaveBeenCalledWith({
        userId: 'K',
        roleId: 'role-KASIR',
        tenantId: 'tA',
        branchId: 'P',
        createdBy: 'adm',
        updatedBy: 'adm',
      });
      expect(repo.save).toHaveBeenCalledWith(expect.anything(), manager);
      expect(result.assignments[0]).toMatchObject({ id: 'new', role: { code: 'KASIR' } });
      expect(result.branchNames.get('P')).toBe('Cabang P');
    });

    it('platform assigns a PLATFORM role with NULL tenant/branch and skips branch checks (AC-D1D-09)', async () => {
      roleService.findByIdOrThrow.mockResolvedValue(role('SUPER_ADMIN'));

      await service.assign('K', { roleId: 'role-SUPER_ADMIN', branchId: null }, platform);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: null, branchId: null, createdBy: 'sa' }),
      );
      expect(branchService.findByIdInScopeOrThrow).not.toHaveBeenCalled();
      expect(userService.findBranchIds).not.toHaveBeenCalled();
      expect(repo.findEffectiveGrants).not.toHaveBeenCalled();
      expect(repo.existsLive).toHaveBeenCalledWith('K', 'role-SUPER_ADMIN', null, manager);
    });

    it('platform needs no grants at the branch but still needs the user_branch (AC-D1D-16)', async () => {
      await service.assign('K', dto, platform);

      expect(repo.findEffectiveGrants).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tA', branchId: 'P' }),
      );
    });
  });

  describe('revoke', () => {
    const live = (over: Record<string, unknown> = {}) => ({
      id: 'A1',
      userId: 'K',
      tenantId: 'tA',
      branchId: 'P',
      role: { code: 'KASIR' },
      ...over,
    });

    beforeEach(() => {
      repo.findLiveById.mockResolvedValue(live());
    });

    it('404 for a user outside the actor tenant (AC-D1D-15)', async () => {
      userService.findByIdInScopeOrThrow.mockRejectedValue(new NotFoundException());

      await expect(service.revoke('B1', 'AB', adminA)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.softRevoke).not.toHaveBeenCalled();
    });

    it.each([
      ['missing or already revoked', null],
      ['belongs to another user', live({ userId: 'other' })],
      ['belongs to another tenant', live({ tenantId: 'tB' })],
      ['is a PLATFORM assignment (tenant NULL)', live({ tenantId: null, branchId: null })],
    ])('404 when the assignment %s (BR-D1D-11)', async (_name, found) => {
      repo.findLiveById.mockResolvedValue(found);

      await expect(service.revoke('K', 'A1', adminA)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.softRevoke).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('404 for a PLATFORM assignment (tenant NULL) even if the actor tenant is NULL too', async () => {
      const noTenant: ActorScope = { userId: 'x', tenantId: null, isPlatform: false, roles: [] };
      repo.findLiveById.mockResolvedValue(live({ tenantId: null, branchId: null }));

      await expect(service.revoke('K', 'A1', noTenant)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.softRevoke).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('a live assignment whose role was soft-deleted can still be revoked (no TypeError/500)', async () => {
      // The repository loads the role even when deleted; the service only needs its code.
      repo.findLiveById.mockResolvedValue(live({ role: { code: 'KASIR', deletedAt: new Date() } }));

      await expect(service.revoke('K', 'A1', adminA)).resolves.toBeUndefined();
      expect(repo.softRevoke).toHaveBeenCalledWith('A1', 'adm', manager);
    });

    it('403 when revoking from oneself (BR-D1D-08)', async () => {
      repo.findLiveById.mockResolvedValue(live({ userId: 'own' }));

      await expect(service.revoke('own', 'A1', ownerA)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.softRevoke).not.toHaveBeenCalled();
    });

    it('ADMIN revoking the last OWNER gets 403 (hierarchy first), not 409 (AC-D1D-18a)', async () => {
      repo.findLiveById.mockResolvedValue(live({ role: { code: 'OWNER' } }));

      await expect(service.revoke('K', 'A1', adminA)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.countOtherActiveOwnerAssignments).not.toHaveBeenCalled();
      expect(repo.softRevoke).not.toHaveBeenCalled();
    });

    it('403 when the actor lacks identity.user_role.revoke at the assignment branch (BR-D1D-09)', async () => {
      repo.findEffectiveGrants.mockResolvedValue(grantRows(['ADMIN'], ['identity.user_role.read']));

      await expect(service.revoke('K', 'A1', adminA)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.findEffectiveGrants).toHaveBeenCalledWith('adm', 'tA', 'P');
      expect(repo.softRevoke).not.toHaveBeenCalled();
    });

    it('ADMIN revokes KASIR: soft delete by the actor inside a transaction (AC-D1D-15 positive)', async () => {
      await expect(service.revoke('K', 'A1', adminA)).resolves.toBeUndefined();

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(repo.softRevoke).toHaveBeenCalledWith('A1', 'adm', manager);
      expect(tenantService.lockByIds).not.toHaveBeenCalled();
    });

    describe('OWNER assignments (BR-D1D-03, KP-32)', () => {
      beforeEach(() => {
        repo.findLiveById.mockResolvedValue(live({ role: { code: 'OWNER' } }));
        repo.findEffectiveGrants.mockResolvedValue(ownerGrants());
      });

      it('409 for the last active OWNER; nothing is revoked (AC-D1D-18b)', async () => {
        repo.countOtherActiveOwnerAssignments.mockResolvedValue(0);

        await expect(service.revoke('K', 'A1', platform)).rejects.toBeInstanceOf(ConflictException);
        expect(tenantService.lockByIds).toHaveBeenCalledWith(['tA'], manager);
        expect(repo.countOtherActiveOwnerAssignments).toHaveBeenCalledWith('tA', 'A1', manager);
        expect(repo.softRevoke).not.toHaveBeenCalled();
      });

      it('lock is taken before the count and the re-read happens under the lock', async () => {
        const order: string[] = [];
        tenantService.lockByIds.mockImplementation(() => {
          order.push('lock');
          return Promise.resolve();
        });
        repo.findLiveById.mockImplementation((_id: string, m?: unknown) => {
          order.push(m ? 'reread' : 'read');
          return Promise.resolve(live({ role: { code: 'OWNER' } }));
        });
        repo.countOtherActiveOwnerAssignments.mockImplementation(() => {
          order.push('count');
          return Promise.resolve(1);
        });
        repo.softRevoke.mockImplementation(() => {
          order.push('revoke');
          return Promise.resolve(1);
        });

        await service.revoke('K', 'A1', ownerA2());

        expect(order).toEqual(['read', 'lock', 'reread', 'count', 'revoke']);
      });

      it('allowed when another active OWNER assignment remains (AC-D1D-18c)', async () => {
        repo.countOtherActiveOwnerAssignments.mockResolvedValue(1);

        await service.revoke('K', 'A1', platform);

        expect(repo.softRevoke).toHaveBeenCalledWith('A1', 'sa', manager);
      });

      it('a revoked-in-between assignment (re-read under lock) is 404, not a double revoke', async () => {
        repo.findLiveById
          .mockResolvedValueOnce(live({ role: { code: 'OWNER' } }))
          .mockResolvedValueOnce(null);

        await expect(service.revoke('K', 'A1', platform)).rejects.toBeInstanceOf(NotFoundException);
        expect(repo.softRevoke).not.toHaveBeenCalled();
      });

      it('an inactive OWNER user is not counted, so revoking it is never blocked (KP-32 b)', async () => {
        userService.findByIdOrThrow.mockResolvedValue({ id: 'K', status: UserStatus.Inactive });
        repo.countOtherActiveOwnerAssignments.mockResolvedValue(0);

        await service.revoke('K', 'A1', platform);

        expect(repo.countOtherActiveOwnerAssignments).not.toHaveBeenCalled();
        expect(repo.softRevoke).toHaveBeenCalledTimes(1);
      });

      it('OWNER (not platform) may revoke another OWNER when one remains', async () => {
        await service.revoke('K', 'A1', ownerA2());

        expect(repo.softRevoke).toHaveBeenCalledWith('A1', 'own2', manager);
      });
    });

    it('404 when softRevoke affects no row (lost a race)', async () => {
      repo.softRevoke.mockResolvedValue(0);

      await expect(service.revoke('K', 'A1', adminA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('platform may revoke a PLATFORM assignment (tenant NULL) without branch grants', async () => {
      repo.findLiveById.mockResolvedValue(
        live({ tenantId: null, branchId: null, role: { code: 'SUPER_ADMIN' } }),
      );

      await service.revoke('K', 'A1', platform);

      expect(repo.findEffectiveGrants).not.toHaveBeenCalled();
      expect(tenantService.lockByIds).not.toHaveBeenCalled();
      expect(repo.softRevoke).toHaveBeenCalledWith('A1', 'sa', manager);
    });

    function ownerA2(): ActorScope {
      return { userId: 'own2', tenantId: 'tA', isPlatform: false, roles: ['OWNER'] };
    }
  });

  describe('list', () => {
    it('404 for a user outside scope', async () => {
      userService.findByIdInScopeOrThrow.mockRejectedValue(new NotFoundException());

      await expect(service.list('B1', false, adminA)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.findByUser).not.toHaveBeenCalled();
    });

    it('non-platform actors only see their own tenant (a SUPER_ADMIN row stays hidden)', async () => {
      const rows = [{ id: 'A1', branchId: 'P' }];
      repo.findByUser.mockResolvedValue(rows);

      const result = await service.list('K', true, adminA);

      expect(repo.findByUser).toHaveBeenCalledWith('K', { includeRevoked: true, tenantId: 'tA' });
      expect(result.assignments).toBe(rows);
      expect(branchService.findByIdsWithDeleted).toHaveBeenCalledWith(['P']);
      expect(result.branchNames.get('P')).toBe('Cabang P');
    });

    it('the platform is not tenant-filtered; PLATFORM rows need no branch lookup', async () => {
      repo.findByUser.mockResolvedValue([{ id: 'A9', branchId: null }]);

      await service.list('K', false, platform);

      expect(repo.findByUser).toHaveBeenCalledWith('K', {
        includeRevoked: false,
        tenantId: undefined,
      });
      expect(branchService.findByIdsWithDeleted).not.toHaveBeenCalled();
    });

    it('an actor without a tenant never gets an unfiltered listing', async () => {
      const noTenant: ActorScope = { userId: 'x', tenantId: null, isPlatform: false, roles: [] };

      await expect(service.list('K', true, noTenant)).resolves.toMatchObject({ assignments: [] });
      expect(repo.findByUser).not.toHaveBeenCalled();
    });
  });
});
