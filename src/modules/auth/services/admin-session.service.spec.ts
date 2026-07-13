import { NotFoundException } from '@nestjs/common';
import { SessionEntity } from '../../../shared/auth/entities/session.entity';
import { SessionRepository } from '../../../shared/auth/repositories/session.repository';
import { UserService } from '../../user/services/user.service';
import { AdminSessionQueryDto } from '../dto/admin-session-query.dto';
import { AdminSessionService } from './admin-session.service';

describe('AdminSessionService', () => {
  let sessionRepository: jest.Mocked<
    Pick<SessionRepository, 'findAllPaginated' | 'findById' | 'deleteById'>
  >;
  let userService: jest.Mocked<Pick<UserService, 'findByIds'>>;
  let service: AdminSessionService;

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
    userService = { findByIds: jest.fn().mockResolvedValue([]) };
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

    const result = await service.list(new AdminSessionQueryDto(), 'session-1');

    expect(sessionRepository.findAllPaginated).toHaveBeenCalledWith(
      { userId: undefined, activeOnly: true },
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

    await service.list(query, 'session-x');

    expect(sessionRepository.findAllPaginated).toHaveBeenCalledWith(
      { userId: 'user-9', activeOnly: false },
      2,
      10,
    );
  });

  it('revokes an existing session', async () => {
    sessionRepository.findById.mockResolvedValue(buildSession());

    await service.revoke('session-1');

    expect(sessionRepository.deleteById).toHaveBeenCalledWith('session-1');
  });

  it('throws NotFound when revoking a missing session', async () => {
    sessionRepository.findById.mockResolvedValue(null);

    await expect(service.revoke('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(sessionRepository.deleteById).not.toHaveBeenCalled();
  });
});
