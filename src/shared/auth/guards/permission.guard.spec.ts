import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ActiveContext,
  ActiveContextService,
} from '../../../modules/role/services/active-context.service';
import { AuthedRequest } from '../auth.types';
import { Public } from '../decorators/public.decorator';
import { PermissionExempt, RequirePermission } from '../decorators/require-permission.decorator';
import { PermissionGuard } from './permission.guard';

const handler = (name: keyof Sample): (() => void) => Reflect.get(Sample.prototype, name);

class Sample {
  @RequirePermission('identity.user.read')
  guarded(): void {}

  undeclared(): void {}

  @PermissionExempt()
  exempt(): void {}

  @Public()
  open(): void {}
}

describe('PermissionGuard (BR-D1C-01, AC-D1C-04, AC-D1C-09)', () => {
  let resolve: jest.Mock;
  let guard: PermissionGuard;

  const active = (permissions: string[]): ActiveContext => ({
    context: null,
    roles: [],
    platformRoles: [],
    permissions,
    branches: [],
  });

  const contextFor = (handler: () => void, request: Partial<AuthedRequest>): ExecutionContext =>
    ({
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => Sample,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    resolve = jest.fn().mockResolvedValue(active(['identity.user.read']));
    guard = new PermissionGuard(new Reflector(), { resolve } as unknown as ActiveContextService);
  });

  it('allows a user holding the declared permission and stores the resolved context', async () => {
    const request = { user: { id: 'u1' } } as AuthedRequest;

    await expect(guard.canActivate(contextFor(handler('guarded'), request))).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith('u1');
    expect(request.activeContext?.permissions).toEqual(['identity.user.read']);
  });

  it('rejects with 403 when the user lacks the permission (e.g. KASIR)', async () => {
    resolve.mockResolvedValue(active(['billing.sale.create']));

    await expect(
      guard.canActivate(contextFor(handler('guarded'), { user: { id: 'u1' } } as AuthedRequest)),
    ).rejects.toThrow(new ForbiddenException('Anda tidak memiliki izin untuk aksi ini'));
  });

  it('default-deny: a handler without a declaration is 403 even for a user with permissions', async () => {
    await expect(
      guard.canActivate(contextFor(handler('undeclared'), { user: { id: 'u1' } } as AuthedRequest)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('skips @PermissionExempt() and @Public() handlers without resolving the context', async () => {
    await expect(
      guard.canActivate(contextFor(handler('exempt'), { user: { id: 'u1' } } as AuthedRequest)),
    ).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(handler('open'), {}))).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('answers 401 when no authenticated user is attached', async () => {
    await expect(guard.canActivate(contextFor(handler('guarded'), {}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('ignores non-http contexts', async () => {
    const context = { getType: () => 'rpc' } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
