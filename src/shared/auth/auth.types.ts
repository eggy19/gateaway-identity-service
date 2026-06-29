import type { Request } from 'express';
import type { UserStatus } from '../../modules/user/enums/user-status.enum';
import type { AuthInstance } from './better-auth';

/** Non-null result of `auth.api.getSession` (session + user). */
export type SessionResult = NonNullable<Awaited<ReturnType<AuthInstance['api']['getSession']>>>;

/**
 * The authenticated user. Augmented with the `status` additional field, which
 * Better Auth's inferred type does not surface through the factory boundary.
 */
export type SessionUser = SessionResult['user'] & { status?: UserStatus | null };

/** The active session record as inferred by Better Auth. */
export type SessionInfo = SessionResult['session'];

/**
 * Express request enriched by {@link SessionGuard} with the authenticated
 * user and session.
 */
export interface AuthedRequest extends Request {
  user?: SessionUser;
  session?: SessionInfo;
}
