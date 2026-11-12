import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveContextService } from '../../../modules/role/services/active-context.service';
import { FORBIDDEN_MESSAGE } from '../actor-scope';
import { AuthedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  PERMISSION_EXEMPT_KEY,
  REQUIRE_PERMISSION_KEY,
} from '../decorators/require-permission.decorator';

/**
 * Global default-deny permission guard for Gateway-owned endpoints (BR-D1C-01).
 * Runs after {@link SessionGuard}.
 *
 * - `@Public()` and `@PermissionExempt()` handlers/controllers are skipped.
 * - Any other handler must declare `@RequirePermission(...)`; undeclared -> 403.
 * - The permission is checked against the output of the single active-context resolver
 *   (BR-D1B-01/11), which is stored on the request for `@Actor()`.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly activeContextService: ActiveContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(PERMISSION_EXEMPT_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw new UnauthorizedException('Authentication required');
    }

    const required = this.reflector.get<string | undefined>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );
    if (!required) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const active = await this.activeContextService.resolve(request.user.id);
    if (!active.permissions.includes(required)) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
    request.activeContext = active;
    return true;
  }
}
