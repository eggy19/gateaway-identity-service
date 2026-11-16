import { NotFoundException } from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { RoleRepository } from '../repositories/role.repository';
import { RoleService } from './role.service';

describe('RoleService (§8.4, AC-D1D-08)', () => {
  const adminA: ActorScope = { userId: 'adm', tenantId: 'tA', isPlatform: false, roles: ['ADMIN'] };
  const platform: ActorScope = {
    userId: 'sa',
    tenantId: null,
    isPlatform: true,
    roles: ['SUPER_ADMIN'],
  };
  let repo: {
    findVisible: jest.Mock;
    findVisibleById: jest.Mock;
    findPermissionsOfRole: jest.Mock;
    findAllPermissions: jest.Mock;
  };
  let service: RoleService;

  beforeEach(() => {
    repo = {
      findVisible: jest.fn().mockResolvedValue([]),
      findVisibleById: jest.fn(),
      findPermissionsOfRole: jest.fn().mockResolvedValue([{ code: 'a.b.c' }]),
      findAllPermissions: jest.fn().mockResolvedValue([]),
    };
    service = new RoleService(repo as unknown as RoleRepository);
  });

  it('non-platform actors list with tenant visibility (no PLATFORM roles)', async () => {
    await service.findAll(adminA);

    expect(repo.findVisible).toHaveBeenCalledWith({ platform: false, tenantId: 'tA' });
  });

  it('the platform lists with platform visibility', async () => {
    await service.findAll(platform);

    expect(repo.findVisible).toHaveBeenCalledWith({ platform: true });
  });

  it('an invisible role is 404, not 403', async () => {
    repo.findVisibleById.mockResolvedValue(null);

    await expect(service.findByIdOrThrow('r1', adminA)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findVisibleById).toHaveBeenCalledWith('r1', { platform: false, tenantId: 'tA' });
  });

  it('detail loads the permissions of the visible role only', async () => {
    repo.findVisibleById.mockResolvedValue({ id: 'r1' });

    await expect(service.findDetail('r1', adminA)).resolves.toEqual({
      role: { id: 'r1' },
      permissions: [{ code: 'a.b.c' }],
    });
    expect(repo.findPermissionsOfRole).toHaveBeenCalledWith('r1');
  });

  it('detail does not load permissions of an invisible role', async () => {
    repo.findVisibleById.mockResolvedValue(null);

    await expect(service.findDetail('r1', adminA)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findPermissionsOfRole).not.toHaveBeenCalled();
  });

  it('permission catalog includes platform permissions only for the platform', async () => {
    await service.findAllPermissions(adminA);
    await service.findAllPermissions(platform);

    expect(repo.findAllPermissions).toHaveBeenNthCalledWith(1, false);
    expect(repo.findAllPermissions).toHaveBeenNthCalledWith(2, true);
  });
});
