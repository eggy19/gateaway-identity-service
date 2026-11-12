import { SetMetadata } from '@nestjs/common';
import type { IdentityPermission } from '../identity-permissions';

export const REQUIRE_PERMISSION_KEY = 'require_permission';
export const PERMISSION_EXEMPT_KEY = 'permission_exempt';

/** Declares the single `identity.*` permission a Gateway-owned handler needs (BR-D1C-01). */
export const RequirePermission = (permission: IdentityPermission): MethodDecorator =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);

/**
 * Explicit exemption from the permission guard. Only for the caller's own `/auth/*` and
 * `/sessions`, and the downstream proxy (permissions enforced downstream, BR-D1B-09).
 * `@Public()` routes (login, health) are skipped without it.
 */
export const PermissionExempt = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_EXEMPT_KEY, true);
