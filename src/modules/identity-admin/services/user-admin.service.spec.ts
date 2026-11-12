import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { UserRoleRepository } from '../../role/repositories/user-role.repository';
import { TenantService } from '../../tenant/services/tenant.service';
import { UserStatus } from '../../user/enums/user-status.enum';
import { UserSecurityService } from '../../user/services/user-security.service';
import { UserService } from '../../user/services/user.service';
import { UserAdminService } from './user-admin.service';

describe('UserAdminService (KP-33, BR-D1C-06, BR-D1D-03)', () => {
  const manager = { tx: true };
  const adminA: ActorScope = { userId: 'adm', tenantId: 'tA', isPlatform: false, roles: ['ADMIN'] };
  const ownerA: ActorScope = { userId: 'own', tenantId: 'tA', isPlatform: false, roles: ['OWNER'] };
  const platform: ActorScope = {
    userId: 'sa',
    tenantId: 'tA',
    isPlatform: true,
    roles: ['SUPER_ADMIN'],
  };
  const inactive = { status: UserStatus.Inactive };
  const active = { status: UserStatus.Active };

  let userService: {
    findByIdInScopeOrThrow: jest.Mock;
    findByIdOrThrow: jest.Mock;
    updateStatus: jest.Mock;
    findDetail: jest.Mock;
  };
  let userSecurityService: { unlock: jest.Mock };
  let userRoleRepository: {
    findHeldRoleCodes: jest.Mock;
    findOwnerTenantIds: jest.Mock;
    countOtherActiveOwners: jest.Mock;
  };
  let tenantService: { lockByIds: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: UserAdminService;

  beforeEach(() => {
    userService = {
      findByIdInScopeOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'target', status: UserStatus.Active }),
      findByIdOrThrow: jest.fn().mockResolvedValue({ id: 'target', status: UserStatus.Active }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'target' }),
      findDetail: jest.fn().mockResolvedValue({ detail: true }),
    };
    userSecurityService = { unlock: jest.fn().mockResolvedValue(undefined) };
    userRoleRepository = {
      findHeldRoleCodes: jest.fn().mockResolvedValue([]),
      findOwnerTenantIds: jest.fn().mockResolvedValue([]),
      countOtherActiveOwners: jest.fn().mockResolvedValue(1),
    };
    tenantService = { lockByIds: jest.fn().mockResolvedValue(undefined) };
    dataSource = { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
    service = new UserAdminService(
      userService as unknown as UserService,
      userSecurityService as unknown as UserSecurityService,
      userRoleRepository as unknown as UserRoleRepository,
      tenantService as unknown as TenantService,
      dataSource as unknown as DataSource,
    );
  });

  describe('updateStatus', () => {
    it('404s for a user outside the actor tenant before anything else (AC-D1C-02)', async () => {
      userService.findByIdInScopeOrThrow.mockRejectedValue(new NotFoundException());

      await expect(service.updateStatus('other', inactive, adminA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(userService.updateStatus).not.toHaveBeenCalled();
    });

    it('422 when the actor deactivates themselves, even as OWNER (AC-D1C-10)', async () => {
      await expect(service.updateStatus('own', inactive, ownerA)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(userService.updateStatus).not.toHaveBeenCalled();
    });

    it('self-check wins over hierarchy: ADMIN deactivating self is 422, not 403', async () => {
      userRoleRepository.findHeldRoleCodes.mockResolvedValue(['ADMIN']);

      await expect(service.updateStatus('adm', inactive, adminA)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('ADMIN cannot deactivate a user holding OWNER/ADMIN: 403 and no write (KP-33)', async () => {
      userRoleRepository.findHeldRoleCodes.mockResolvedValue(['OWNER']);

      await expect(service.updateStatus('target', inactive, adminA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(userRoleRepository.findHeldRoleCodes).toHaveBeenCalledWith('target', [
        'OWNER',
        'ADMIN',
        'SUPER_ADMIN',
      ]);
      expect(userService.updateStatus).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('ADMIN cannot even re-activate a user holding OWNER (KP-33)', async () => {
      userRoleRepository.findHeldRoleCodes.mockResolvedValue(['OWNER']);

      await expect(service.updateStatus('target', active, adminA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('ADMIN may change status of a user without protected roles', async () => {
      await service.updateStatus('target', inactive, adminA);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(userService.updateStatus).toHaveBeenCalledWith('target', inactive, manager);
    });

    it('platform skips the hierarchy lookup; OWNER may manage OWNER/ADMIN targets', async () => {
      await service.updateStatus('target', inactive, platform);
      expect(userRoleRepository.findHeldRoleCodes).not.toHaveBeenCalled();

      userRoleRepository.findHeldRoleCodes.mockResolvedValue(['OWNER', 'ADMIN']);
      await service.updateStatus('target', inactive, ownerA);
      expect(userService.updateStatus).toHaveBeenCalledTimes(2);
    });

    it('OWNER cannot deactivate a SUPER_ADMIN target: 403 and no write', async () => {
      userRoleRepository.findHeldRoleCodes.mockResolvedValue(['OWNER', 'SUPER_ADMIN']);

      await expect(service.updateStatus('target', inactive, ownerA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.updateStatus('target', active, ownerA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(userService.updateStatus).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('platform actor may manage a SUPER_ADMIN target', async () => {
      userRoleRepository.findHeldRoleCodes.mockResolvedValue(['SUPER_ADMIN']);

      await service.updateStatus('target', inactive, platform);

      expect(userService.updateStatus).toHaveBeenCalledWith('target', inactive, manager);
    });

    it('re-reads the target on the transaction manager after locking the tenants', async () => {
      userRoleRepository.findOwnerTenantIds.mockResolvedValue(['tA']);
      const order: string[] = [];
      tenantService.lockByIds.mockImplementation(() => {
        order.push('lock');
        return Promise.resolve();
      });
      userService.findByIdOrThrow.mockImplementation((_id: string, m?: unknown) => {
        order.push(m === manager ? 'reread-tx' : 'read-pool');
        return Promise.resolve({ id: 'target', status: UserStatus.Active });
      });

      await service.updateStatus('target', inactive, ownerA);

      expect(order.slice(0, 2)).toEqual(['lock', 'reread-tx']);
    });

    it('a target that became inactive meanwhile (judged after the lock) is not re-deactivated or counted', async () => {
      userRoleRepository.findOwnerTenantIds.mockResolvedValue(['tA']);
      userRoleRepository.countOtherActiveOwners.mockResolvedValue(0);
      userService.findByIdOrThrow.mockResolvedValue({ id: 'target', status: UserStatus.Inactive });

      await service.updateStatus('target', inactive, ownerA);

      expect(userRoleRepository.countOtherActiveOwners).not.toHaveBeenCalled();
      expect(userService.updateStatus).not.toHaveBeenCalled();
    });

    it('409 when deactivating the last active OWNER of a tenant, after locking the tenant', async () => {
      userRoleRepository.findOwnerTenantIds.mockResolvedValue(['tA']);
      userRoleRepository.countOtherActiveOwners.mockResolvedValue(0);

      await expect(service.updateStatus('target', inactive, ownerA)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tenantService.lockByIds).toHaveBeenCalledWith(['tA'], manager);
      expect(userRoleRepository.countOtherActiveOwners).toHaveBeenCalledWith(
        'tA',
        'target',
        manager,
      );
      expect(userService.updateStatus).not.toHaveBeenCalled();
    });

    it('allows deactivating an OWNER when another active OWNER remains', async () => {
      userRoleRepository.findOwnerTenantIds.mockResolvedValue(['tA']);
      userRoleRepository.countOtherActiveOwners.mockResolvedValue(1);

      await service.updateStatus('target', inactive, ownerA);

      expect(userService.updateStatus).toHaveBeenCalledWith('target', inactive, manager);
    });

    it('checks every tenant in which the target is OWNER', async () => {
      userRoleRepository.findOwnerTenantIds.mockResolvedValue(['tA', 'tB']);
      userRoleRepository.countOtherActiveOwners.mockImplementation((tenantId: string) =>
        Promise.resolve(tenantId === 'tB' ? 0 : 2),
      );

      await expect(service.updateStatus('target', inactive, platform)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('activation skips the transaction and the owner check', async () => {
      await service.updateStatus('target', active, ownerA);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(userRoleRepository.findOwnerTenantIds).not.toHaveBeenCalled();
      expect(userService.updateStatus).toHaveBeenCalledWith('target', active);
    });
  });

  describe('unlock', () => {
    it('404s for a user outside the actor tenant (AC-D1C-02)', async () => {
      userService.findByIdInScopeOrThrow.mockRejectedValue(new NotFoundException());

      await expect(service.unlock('other', adminA)).rejects.toBeInstanceOf(NotFoundException);
      expect(userSecurityService.unlock).not.toHaveBeenCalled();
    });

    it('ADMIN cannot unlock a user holding OWNER (KP-33)', async () => {
      userRoleRepository.findHeldRoleCodes.mockResolvedValue(['OWNER']);

      await expect(service.unlock('target', adminA)).rejects.toBeInstanceOf(ForbiddenException);
      expect(userSecurityService.unlock).not.toHaveBeenCalled();
    });

    it('OWNER cannot unlock a SUPER_ADMIN target', async () => {
      userRoleRepository.findHeldRoleCodes.mockResolvedValue(['OWNER', 'SUPER_ADMIN']);

      await expect(service.unlock('target', ownerA)).rejects.toBeInstanceOf(ForbiddenException);
      expect(userSecurityService.unlock).not.toHaveBeenCalled();
    });

    it('unlocks and returns the scoped detail', async () => {
      await expect(service.unlock('target', adminA)).resolves.toEqual({ detail: true });

      expect(userSecurityService.unlock).toHaveBeenCalledWith('target', 'adm');
      expect(userService.findDetail).toHaveBeenCalledWith('target', adminA);
    });
  });
});
