import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '../../../modules/user/enums/user-status.enum';
import type { AuthInstance } from '../better-auth';
import { AUTH_INSTANCE } from '../auth.tokens';
import { AuthedRequest, SessionUser } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { toWebHeaders } from '../http-headers.util';

/**
 * Global guard that validates the Better Auth cookie session (Business Flow §8).
 *
 * - Routes marked `@Public()` are skipped.
 * - A missing/expired session yields 401.
 * - A user whose status is not `active` yields 403 (Business Rules: "User must be active").
 *
 * On success the user and session are attached to the request for
 * `@CurrentUser()` / `@CurrentSession()`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: AuthInstance,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const result = await this.auth.api.getSession({
      headers: toWebHeaders(request.headers),
    });

    if (!result) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = result.user as SessionUser;
    if (user.status && user.status !== UserStatus.Active) {
      throw new ForbiddenException('User account is not active');
    }

    request.user = user;
    request.session = result.session;
    return true;
  }
}
