import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserSecurityEntity } from '../entities/user-security.entity';
import { UserSecurityRepository } from '../repositories/user-security.repository';
import { UserSecurityService } from './user-security.service';

describe('UserSecurityService', () => {
  let repository: jest.Mocked<Pick<UserSecurityRepository, 'findByUserId' | 'save'>>;
  let service: UserSecurityService;

  const buildSecurity = (overrides: Partial<UserSecurityEntity> = {}): UserSecurityEntity =>
    ({ failedLoginCount: 0, blockUntil: null, ...overrides }) as UserSecurityEntity;

  beforeEach(() => {
    repository = { findByUserId: jest.fn(), save: jest.fn() };
    const config = {
      getOrThrow: jest.fn().mockReturnValue({ maxFailedAttempts: 3, lockDurationMinutes: 15 }),
    } as unknown as ConfigService;
    service = new UserSecurityService(repository as unknown as UserSecurityRepository, config);
  });

  it('reports a future block time as locked', () => {
    expect(service.isLocked(buildSecurity({ blockUntil: new Date(Date.now() + 60_000) }))).toBe(
      true,
    );
    expect(service.isLocked(buildSecurity({ blockUntil: new Date(Date.now() - 60_000) }))).toBe(
      false,
    );
    expect(service.isLocked(null)).toBe(false);
  });

  it('locks the account once the failed-attempt threshold is reached', async () => {
    const security = buildSecurity({ failedLoginCount: 2 });
    repository.findByUserId.mockResolvedValue(security);

    await service.registerFailedAttempt('user-1');

    expect(security.failedLoginCount).toBe(3);
    expect(security.blockUntil).toBeInstanceOf(Date);
    expect(repository.save).toHaveBeenCalledWith(security);
  });

  it('does not lock before the threshold', async () => {
    const security = buildSecurity({ failedLoginCount: 0 });
    repository.findByUserId.mockResolvedValue(security);

    await service.registerFailedAttempt('user-1');

    expect(security.failedLoginCount).toBe(1);
    expect(security.blockUntil).toBeNull();
  });

  it('unlock clears the lock state and counter', async () => {
    const security = buildSecurity({
      failedLoginCount: 3,
      blockUntil: new Date(Date.now() + 60_000),
      lockReason: 'Too many failed login attempts',
    });
    repository.findByUserId.mockResolvedValue(security);

    await service.unlock('user-1', 'admin-1');

    expect(security.failedLoginCount).toBe(0);
    expect(security.blockUntil).toBeNull();
    expect(security.lockReason).toBeNull();
    expect(security.updatedBy).toBe('admin-1');
    expect(repository.save).toHaveBeenCalledWith(security);
  });

  it('unlock throws when no security record exists', async () => {
    repository.findByUserId.mockResolvedValue(null);

    await expect(service.unlock('missing', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('resets the counter and records login info on success', async () => {
    const security = buildSecurity({ failedLoginCount: 3, blockUntil: new Date() });
    repository.findByUserId.mockResolvedValue(security);

    await service.registerSuccessfulLogin('user-1', '10.0.0.1', 'agent');

    expect(security.failedLoginCount).toBe(0);
    expect(security.blockUntil).toBeNull();
    expect(security.lastLoginIp).toBe('10.0.0.1');
    expect(security.lastLoginDevice).toBe('agent');
  });
});
