import { Injectable } from '@nestjs/common';
import { BranchStatus } from '../../branch/enums/branch-status.enum';
import { BranchService } from '../../branch/services/branch.service';
import { TenantStatus } from '../../tenant/enums/tenant-status.enum';
import { TenantService } from '../../tenant/services/tenant.service';
import { UserBranchRepository } from '../../user/repositories/user-branch.repository';
import { RoleScope } from '../enums/role-scope.enum';
import { UserRoleRepository } from '../repositories/user-role.repository';

export type ActiveContextStatus = 'active' | 'tenant_inactive' | 'branch_inactive';

export interface ActiveContextInfo {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly tenantCode: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly branchCode: string;
  readonly status: ActiveContextStatus;
}

export interface UserBranchInfo {
  readonly branchId: string;
  readonly branchName: string;
  readonly isPrimary: boolean;
}

/** Output of the single active-context resolver (BR-D1B-01 / BR-D1B-11). */
export interface ActiveContext {
  /** `null` when the user has no (live) branch assignment. */
  readonly context: ActiveContextInfo | null;
  /** All effective role codes, sorted (includes PLATFORM roles). */
  readonly roles: string[];
  /** Subset of `roles` whose scope is PLATFORM (never sent to downstream, BR-D1B-05). */
  readonly platformRoles: string[];
  /** Effective permissions, no duplicates, sorted alphabetically (BR-D1B-04). */
  readonly permissions: string[];
  readonly branches: UserBranchInfo[];
}

/** Role codes for the Internal JWT: every effective role except PLATFORM roles (BR-D1B-05). */
export function jwtRoles(ctx: ActiveContext): string[] {
  return ctx.roles.filter((role) => !ctx.platformRoles.includes(role));
}

/**
 * Permissions for the Internal JWT of one downstream service. The prefix is the
 * `GATEWAY_ROUTES` key itself (BR-D1B-12), so `identity.*` is never included.
 */
export function jwtPermissions(ctx: ActiveContext, serviceKey: string): string[] {
  const prefix = `${serviceKey}.`;
  return ctx.permissions.filter((permission) => permission.startsWith(prefix));
}

/**
 * The one place that decides a user's active tenant/branch, roles, and permissions.
 * Active branch = primary branch (KP-01). Evaluated on every call, no cache (BR-D1B-06).
 * User status is enforced earlier by SessionGuard.
 */
@Injectable()
export class ActiveContextService {
  constructor(
    private readonly userBranchRepository: UserBranchRepository,
    private readonly branchService: BranchService,
    private readonly tenantService: TenantService,
    private readonly userRoleRepository: UserRoleRepository,
  ) {}

  async resolve(userId: string): Promise<ActiveContext> {
    const assignments = await this.userBranchRepository.findByUser(userId);
    const branches = await this.branchService.findByIdsWithDeleted(
      assignments.map((assignment) => assignment.branchId),
    );
    const branchById = new Map(branches.map((branch) => [branch.id, branch]));

    // Primary assignment; fall back to the oldest one (previous findPrimaryByUserId behaviour).
    const sorted = [...assignments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const primary = sorted.find((assignment) => assignment.isPrimary) ?? sorted[0];
    const branch = primary ? branchById.get(primary.branchId) : undefined;

    let context: ActiveContextInfo | null = null;
    if (primary && branch) {
      const [tenant] = await this.tenantService.findByIdsWithDeleted([branch.tenantId]);
      const tenantOk = !!tenant && !tenant.deletedAt && tenant.status === TenantStatus.Active;
      const branchOk = !branch.deletedAt && branch.status === BranchStatus.Active;
      context = {
        tenantId: branch.tenantId,
        tenantName: tenant?.name ?? '',
        tenantCode: tenant?.code ?? '',
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code,
        status: !tenantOk ? 'tenant_inactive' : !branchOk ? 'branch_inactive' : 'active',
      };
    }

    const grants = await this.userRoleRepository.findEffectiveGrants(
      userId,
      context?.tenantId ?? null,
      context?.branchId ?? null,
    );
    const roles = new Set<string>();
    const platformRoles = new Set<string>();
    const permissions = new Set<string>();
    for (const grant of grants) {
      roles.add(grant.roleCode);
      if (grant.roleScope === RoleScope.Platform) platformRoles.add(grant.roleCode);
      if (grant.permissionCode) permissions.add(grant.permissionCode);
    }

    const branchInfos: UserBranchInfo[] = [];
    for (const assignment of sorted) {
      const assigned = branchById.get(assignment.branchId);
      if (!assigned || assigned.deletedAt) continue;
      branchInfos.push({
        branchId: assigned.id,
        branchName: assigned.name,
        isPrimary: assignment.id === primary?.id,
      });
    }

    return {
      context,
      roles: [...roles].sort(),
      platformRoles: [...platformRoles].sort(),
      permissions: [...permissions].sort(),
      branches: branchInfos,
    };
  }
}
