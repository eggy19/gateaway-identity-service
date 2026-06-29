import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthInstance } from '../../../shared/auth/better-auth';
import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { SessionRepository } from '../../../shared/auth/repositories/session.repository';
import { UserSecurityService } from '../../user/services/user-security.service';
import { UserService } from '../../user/services/user.service';
import { LoginResult } from '../enums/login-result.enum';
import { LoginHistoryRepository } from '../repositories/login-history.repository';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  let signInEmail: jest.Mock;
  let userService: jest.Mocked<Pick<UserService, 'findByEmail' | 'getPrimaryBranchContext'>>;
  let userSecurityService: jest.Mocked<
    Pick<
      UserSecurityService,
      'findByUserId' | 'isLocked' | 'registerFailedAttempt' | 'registerSuccessfulLogin'
    >
  >;
  let loginHistoryRepository: jest.Mocked<Pick<LoginHistoryRepository, 'create' | 'save'>>;
  let service: AuthService;
  let setHeader: jest.Mock;
  let res: Response;

  const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };
  const activeUser = { id: 'user-1', status: 'active' } as UserEntity;

  const lastHistoryResult = (): LoginResult =>
    loginHistoryRepository.create.mock.calls.at(-1)?.[0]?.loginResult as LoginResult;

  beforeEach(() => {
    signInEmail = jest.fn();
    userService = {
      findByEmail: jest.fn().mockResolvedValue(activeUser),
      getPrimaryBranchContext: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant-1', branchId: 'branch-1' }),
    };
    userSecurityService = {
      findByUserId: jest.fn().mockResolvedValue(null),
      isLocked: jest.fn().mockReturnValue(false),
      registerFailedAttempt: jest.fn(),
      registerSuccessfulLogin: jest.fn(),
    };
    loginHistoryRepository = {
      create: jest.fn((d) => d as never),
      save: jest.fn(),
    };
    setHeader = jest.fn();
    res = { setHeader } as unknown as Response;

    service = new AuthService(
      { api: { signInEmail } } as unknown as AuthInstance,
      userService as unknown as UserService,
      userSecurityService as unknown as UserSecurityService,
      loginHistoryRepository as unknown as LoginHistoryRepository,
      {} as unknown as SessionRepository,
    );
  });

  it('records UserNotFound and rejects for an unknown email', async () => {
    userService.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: 'x@y.z', password: 'p' }, context, res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signInEmail).not.toHaveBeenCalled();
    expect(lastHistoryResult()).toBe(LoginResult.UserNotFound);
  });

  it('rejects a locked account without attempting sign in', async () => {
    userSecurityService.isLocked.mockReturnValue(true);

    await expect(
      service.login({ email: 'a@b.c', password: 'p' }, context, res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signInEmail).not.toHaveBeenCalled();
    expect(lastHistoryResult()).toBe(LoginResult.AccountLocked);
  });

  it('increments the failed counter on an invalid password', async () => {
    signInEmail.mockRejectedValue(new Error('invalid'));

    await expect(
      service.login({ email: 'a@b.c', password: 'wrong' }, context, res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userSecurityService.registerFailedAttempt).toHaveBeenCalledWith('user-1');
    expect(lastHistoryResult()).toBe(LoginResult.InvalidPassword);
  });

  it('resets the counter, forwards the cookie and records success', async () => {
    signInEmail.mockResolvedValue({ headers: { getSetCookie: () => ['better-auth.session=abc'] } });

    const result = await service.login({ email: 'a@b.c', password: 'right' }, context, res);

    expect(result).toBe(activeUser);
    expect(userSecurityService.registerSuccessfulLogin).toHaveBeenCalledWith(
      'user-1',
      '127.0.0.1',
      'jest',
    );
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', ['better-auth.session=abc']);
    expect(lastHistoryResult()).toBe(LoginResult.Success);
  });
});
