import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest, SessionInfo, SessionUser } from '../auth.types';

/**
 * Injects the authenticated user attached by {@link SessionGuard}.
 * Only valid on guarded (non-`@Public`) routes.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser | undefined => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    return request.user;
  },
);

/**
 * Injects the active session attached by {@link SessionGuard}.
 */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionInfo | undefined => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    return request.session;
  },
);
