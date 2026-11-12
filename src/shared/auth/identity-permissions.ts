/**
 * Catalog of `identity.*` permissions for endpoints owned by the Gateway
 * (spec prasyarat-kasir §7.5.2). Seeded by migration `CreateRbac`; keep in sync.
 */
export const IDENTITY_PERMISSIONS = [
  'identity.tenant.read',
  'identity.tenant.create',
  'identity.tenant.update',
  'identity.branch.read',
  'identity.branch.create',
  'identity.branch.update',
  'identity.user.read',
  'identity.user.create',
  'identity.user.update',
  'identity.user.unlock',
  'identity.role.read',
  'identity.user_role.read',
  'identity.user_role.assign',
  'identity.user_role.revoke',
  'identity.session.read',
  'identity.session.revoke',
  'identity.login_history.read',
] as const;

export type IdentityPermission = (typeof IDENTITY_PERMISSIONS)[number];
