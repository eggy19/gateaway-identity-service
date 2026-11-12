import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ActorScope, buildActorScope, FORBIDDEN_MESSAGE } from '../actor-scope';
import { AuthedRequest } from '../auth.types';

/**
 * Injects the {@link ActorScope} of the caller, derived from the active context that
 * PermissionGuard resolved. Only valid on handlers guarded with `@RequirePermission()`.
 */
export const Actor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActorScope => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user || !request.activeContext) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
    return buildActorScope(request.user.id, request.activeContext);
  },
);
