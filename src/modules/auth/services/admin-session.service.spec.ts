import { NotFoundException } from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { SessionEntity } from '../../../shared/auth/entities/session.entity';
import { SessionRepository } from '../../../shared/auth/repositories/session.repository';
import { UserService } from '../../user/services/user.service';
import { AdminSessionQueryDto } from '../dto/admin-session-query.dto';
import { AdminSessionService } from './admin-session.service';

describe('AdminSessionService', () => {
  let sessionRepository: jest.Mocked<
    Pick<SessionRepository, 'findAllPaginated' | 'findById' | 'deleteById'>
  >;
  let userService: jest.Mocked<
    Pick<UserService, 'findByIds' | 'findUserIdsInScope' | 'isUserInScope'>
  >;
  let service: AdminSessionService;

  const platform: ActorScope = {
    userId: 'admin-0',
    tenantId: 'tenant-A',
    isPlatform: true,
    roles: [],
  };
  const tenantAdmin: ActorScope = {
    userId: 'admin-1',
    tenantId: 'tenant-A',
    isPlatform: false,
    roles: ['ADMIN'],
  };

  const buildSession = (overrides: Partial<SessionEntity> = {}): SessionEntity =>
    ({
      id: 'session-1',
      userId: 'user-1',
      ipAddress: '10.0.0.1',
      userAgent: 'agent',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    }) as SessionEntity;

  beforeEach(() => {
    sessionRepository = {
      findAllPaginated: jest.fn(),
      findById: jest.fn(),
      deleteById: jest.fn(),
    };
    userService = {
      findByIds: jest.fn().mockResolvedValue([]),
      findUserIdsInScope: jest.fn().mockResolvedValue(null),
      isUserInScope: jest.fn().mockResolvedValue(true),
    };
    service = new AdminSessionService(
      sessionRepository as unknown as SessionRepository,
      userService as unknown as UserService,
    );
  });

  it('lists sessions enriched with user info and flags the current session', async () => {
    const session = buildSession();
    sessionRepository.findAllPaginated.mockResolvedValue([[session], 1]);
    userService.findByIds.mockResolvedValue([
      { id: 'user-1', name: 'Alice', email: 'a@b.com' } as never,
    ]);

    const result = await service.list(new AdminSessionQueryDto(), 'session-1', platform);

    expect(sessionRepository.findAllPaginated).toHaveBeenCalledWith(
      { userId: undefined, userIds: undefined, activeOnly: true },
      1,
      20,
    );
    expect(result.items[0]).toMatchObject({
      id: 'session-1',
      userName: 'Alice',
      userEmail: 'a@b.com',
      current: true,
    });
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('passes filters through (userId, activeOnly=false)', async () => {
    sessionRepository.findAllPaginated.mockResolvedValue([[], 0]);
    const query = Object.assign(new AdminSessionQueryDto(), {
      userId: 'user-9',
      activeOnly: 'false',
      page: 2,
      limit: 10,
    });

    await service.list(query, 'session-x', platform);

    expect(sessionRepository.findAllPaginated).toHaveBeenCalledWith(
      { userId: 'user-9', userIds: undefined, activeOnly: false },
      2,
      10,
    );
  });

  it('restricts a non-platform actor to the users of their tenant (AC-D1C-01)', async () => {
    userService.findUserIdsInScope.mockResolvedValue(['user-1', 'user-2']);
    sessionRepository.findAllPaginated.mockResolvedValue([[], 0]);

    await service.list(new AdminSessionQueryDto(), 'session-x', tenantAdmin);

    expect(userService.findUserIdsInScope).toHaveBeenCalledWith(tenantAdmin);
    expect(sessionRepository.findAllPaginated).toHaveBeenCalledWith(
      { userId: undefined, userIds: ['user-1', 'user-2'], activeOnly: true },
      1,
      20,
    );
  });

  it('returns an empty page without querying when userId filter is outside the tenant', async () => {
    userService.findUserIdsInScope.mockResolvedValue(['user-1']);
    const query = Object.assign(new AdminSessionQueryDto(), { userId: 'user-of-tenant-B' });

    const result = await service.list(query, 'session-x', tenantAdmin);

    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(sessionRepository.findAllPaginated).not.toHaveBeenCalled();
  });

  it('returns an empty page when the tenant has no users', async () => {
    userService.findUserIdsInScope.mockResolvedValue([]);

    const result = await service.list(new AdminSessionQueryDto(), 'session-x', tenantAdmin);

    expect(result.items).toEqual([]);
    expect(sessionRepository.findAllPaginated).not.toHaveBeenCalled();
  });

  it('revokes an existing session', async () => {
    sessionRepository.findById.mockResolvedValue(buildSession());

    await service.revoke('session-1', platform);

    expect(sessionRepository.deleteById).toHaveBeenCalledWith('session-1');
  });

  it('throws NotFound when revoking a missing session', async () => {
    sessionRepository.findById.mockResolvedValue(null);

    await expect(service.revoke('missing', platform)).rejects.toBeInstanceOf(NotFoundException);
    expect(sessionRepository.deleteById).not.toHaveBeenCalled();
  });

  it("throws NotFound and keeps the session when its user is outside the actor's tenant (AC-D1C-07)", async () => {
    sessionRepository.findById.mockResolvedValue(buildSession({ userId: 'user-of-tenant-B' }));
    userService.isUserInScope.mockResolvedValue(false);

    await expect(service.revoke('session-1', tenantAdmin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(userService.isUserInScope).toHaveBeenCalledWith('user-of-tenant-B', tenantAdmin);
    expect(sessionRepository.deleteById).not.toHaveBeenCalled();
  });
});
