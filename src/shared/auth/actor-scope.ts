import type { ActiveContext } from '../../modules/role/services/active-context.service';

/** 403 message of the standard Gateway envelope (spec §8.3). */
export const FORBIDDEN_MESSAGE = 'Anda tidak memiliki izin untuk aksi ini';

/**
 * Who is acting and which tenant they are confined to (BR-D1C-02/03). Built from the single
 * active-context resolver output (BR-D1B-01); never from request input.
 */
export interface ActorScope {
  readonly userId: string;
  /** Active tenant of the actor; `null` when the actor has no live branch assignment. */
  readonly tenantId: string | null;
  /** Holds a PLATFORM-scope role (SUPER_ADMIN): not confined to a tenant. */
  readonly isPlatform: boolean;
  /** Effective role codes in the active branch plus platform roles. */
  readonly roles: readonly string[];
}

export function buildActorScope(userId: string, active: ActiveContext): ActorScope {
  return {
    userId,
    tenantId: active.context?.tenantId ?? null,
    isPlatform: active.platformRoles.length > 0,
    roles: active.roles,
  };
}

/** True when the actor may see data of `tenantId` (own tenant, or platform). */
export function canAccessTenant(actor: ActorScope, tenantId: string): boolean {
  return actor.isPlatform || (actor.tenantId !== null && actor.tenantId === tenantId);
}
