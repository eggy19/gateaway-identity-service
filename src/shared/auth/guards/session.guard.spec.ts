import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '../../../modules/user/enums/user-status.enum';
import type { AuthInstance } from '../better-auth';
import { AuthedRequest } from '../auth.types';
import { SessionGuard } from './session.guard';

interface MockGetSession {
  (): Promise<{ user: { status: string }; session: object } | null>;
}

describe('SessionGuard', () => {
  let getSession: jest.MockedFunction<MockGetSession>;
  let reflector: Reflector;
  let guard: SessionGuard;

  const buildContext = (request: Partial<AuthedRequest>): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    getSession = jest.fn();
    const auth = { api: { getSession } } as unknown as AuthInstance;
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    guard = new SessionGuard(auth, reflector);
  });

  it('allows public routes without checking the session', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(buildContext({ headers: {} }))).resolves.toBe(true);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('rejects requests without a valid session', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    getSession.mockResolvedValue(null);

    await expect(guard.canActivate(buildContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects users whose status is not active', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    getSession.mockResolvedValue({ user: { status: UserStatus.Inactive }, session: {} });

    await expect(guard.canActivate(buildContext({ headers: {} }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('attaches the user and session for active users', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const user = { status: UserStatus.Active };
    const session = { id: 'sess-1' };
    getSession.mockResolvedValue({ user, session });
    const request: Partial<AuthedRequest> = { headers: {} };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.user).toBe(user);
    expect(request.session).toBe(session);
  });
});
