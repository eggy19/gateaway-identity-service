import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorScope, FORBIDDEN_MESSAGE } from '../../../shared/auth/actor-scope';
import { BranchService } from '../../branch/services/branch.service';
import { UserRoleEntity } from '../../role/entities/user-role.entity';
import { RoleScope } from '../../role/enums/role-scope.enum';
import { RoleStatus } from '../../role/enums/role-status.enum';
import { RoleEntity } from '../../role/entities/role.entity';
import { UserRoleRepository } from '../../role/repositories/user-role.repository';
import { RoleService } from '../../role/services/role.service';
import { TenantService } from '../../tenant/services/tenant.service';
import { UserStatus } from '../../user/enums/user-status.enum';
import { UserService } from '../../user/services/user.service';
import { AssignUserRoleDto } from '../dto/assign-user-role.dto';

const OWNER_ROLE = 'OWNER';
const ADMIN_ROLE = 'ADMIN';
const ASSIGN_PERMISSION = 'identity.user_role.assign';
const REVOKE_PERMISSION = 'identity.user_role.revoke';
const PG_UNIQUE_VIOLATION = '23505';

/** Where a BRANCH-scope assignment lives (a PLATFORM assignment has neither). */
interface AssignmentBranch {
  readonly tenantId: string;
  readonly branchId: string;
}

/** A user's assignments with the names needed by the response. */
export interface UserRoleListing {
  readonly assignments: UserRoleEntity[];
  readonly branchNames: Map<string, string>;
}

/**
 * Assign / revoke / list role assignments of a user per branch (T-22, spec D1-d §5.8).
 * Lives outside `RoleModule` because it also needs user and branch data. Rows are never
 * updated: revoke = soft delete, "change role" = revoke + assign (BR-D1A-09).
 *
 * Check order (BR-D1D-12). Assign: user in scope 404 -> self 403 -> role visible 404 / inactive 422
 * -> role scope vs branch 422 -> branch in scope 404 -> hierarchy + branch authority 403 ->
 * user_branch 422 -> duplicate 409. Revoke: user/assignment in scope 404 -> self 403 ->
 * hierarchy + branch authority 403 -> last OWNER 409. The permission itself (403) is checked by
 * `PermissionGuard` before any of this runs.
 */
@Injectable()
export class UserRoleAdminService {
  constructor(
    private readonly userService: UserService,
    private readonly branchService: BranchService,
    private readonly tenantService: TenantService,
    private readonly roleService: RoleService,
    private readonly userRoleRepository: UserRoleRepository,
    private readonly dataSource: DataSource,
  ) {}

  async list(userId: string, includeRevoked: boolean, actor: ActorScope): Promise<UserRoleListing> {
    await this.userService.findByIdInScopeOrThrow(userId, actor);
    if (!actor.isPlatform && !actor.tenantId) {
      return { assignments: [], branchNames: new Map() };
    }
    const assignments = await this.userRoleRepository.findByUser(userId, {
      includeRevoked,
      tenantId: actor.isPlatform ? undefined : (actor.tenantId ?? undefined),
    });
    return { assignments, branchNames: await this.branchNamesOf(assignments) };
  }

  async assign(
    userId: string,
    dto: AssignUserRoleDto,
    actor: ActorScope,
  ): Promise<UserRoleListing> {
    await this.userService.findByIdInScopeOrThrow(userId, actor);
    if (userId === actor.userId) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const role = await this.roleService.findByIdOrThrow(dto.roleId, actor);
    if (role.status !== RoleStatus.Active) {
      throw new UnprocessableEntityException('Role tidak aktif dan tidak dapat diberikan');
    }

    const branchId = dto.branchId ?? null;
    if (role.scope === RoleScope.Platform && branchId !== null) {
      throw new UnprocessableEntityException('Role platform tidak boleh diberikan pada cabang');
    }
    if (role.scope === RoleScope.Branch && branchId === null) {
      throw new UnprocessableEntityException('Role cabang wajib memiliki branchId');
    }

    // Tenant of the assignment always comes from the branch, never from the request (BR-D1A-06).
    const branch = branchId
      ? await this.branchService.findByIdInScopeOrThrow(branchId, actor)
      : null;
    const where = branch ? { tenantId: branch.tenantId, branchId: branch.id } : null;
    await this.assertAuthority(actor, role.code, ASSIGN_PERMISSION, where);

    if (branch && !(await this.userService.findBranchIds(userId)).includes(branch.id)) {
      throw new UnprocessableEntityException('User belum ditugaskan ke cabang tersebut');
    }

    const created = await this.insertUnique(userId, role, where, actor.userId);
    created.role = role;
    const branchNames = new Map<string, string>();
    if (branch) branchNames.set(branch.id, branch.name);
    return { assignments: [created], branchNames };
  }

  async revoke(userId: string, assignmentId: string, actor: ActorScope): Promise<void> {
    await this.userService.findByIdInScopeOrThrow(userId, actor);
    const assignment = await this.userRoleRepository.findLiveById(assignmentId);
    if (
      !assignment ||
      assignment.userId !== userId ||
      (!actor.isPlatform &&
        (assignment.tenantId === null || assignment.tenantId !== actor.tenantId))
    ) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }
    if (userId === actor.userId) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const where =
      assignment.tenantId && assignment.branchId
        ? { tenantId: assignment.tenantId, branchId: assignment.branchId }
        : null;
    await this.assertAuthority(actor, assignment.role.code, REVOKE_PERMISSION, where);

    await this.dataSource.transaction(async (manager) => {
      if (assignment.role.code === OWNER_ROLE && assignment.tenantId) {
        // Serialised per tenant (BR-D1D-03): the second of two concurrent revocations of the last
        // two OWNERs waits here, then re-reads the state the first one committed.
        await this.tenantService.lockByIds([assignment.tenantId], manager);
        if (!(await this.userRoleRepository.findLiveById(assignmentId, manager))) {
          throw new NotFoundException(`Assignment ${assignmentId} not found`);
        }
        const owner = await this.userService.findByIdOrThrow(userId, manager);
        if (owner.status === UserStatus.Active) {
          const others = await this.userRoleRepository.countOtherActiveOwnerAssignments(
            assignment.tenantId,
            assignmentId,
            manager,
          );
          if (others === 0) {
            throw new ConflictException('Tenant harus memiliki minimal satu OWNER aktif');
          }
        }
      }
      const revoked = await this.userRoleRepository.softRevoke(assignmentId, actor.userId, manager);
      if (revoked === 0) {
        throw new NotFoundException(`Assignment ${assignmentId} not found`);
      }
    });
  }

  /**
   * Hierarchy (BR-D1D-02) and authority at the target branch (BR-D1D-09). The platform is exempt.
   * `SUPER_ADMIN` is reserved for the platform; `OWNER`/`ADMIN` need an `OWNER` at that branch.
   */
  private async assertAuthority(
    actor: ActorScope,
    roleCode: string,
    permission: string,
    where: AssignmentBranch | null,
  ): Promise<void> {
    if (actor.isPlatform) return;
    if (!where) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
    const grants = await this.userRoleRepository.findEffectiveGrants(
      actor.userId,
      where.tenantId,
      where.branchId,
    );
    const permissions = new Set(grants.map((grant) => grant.permissionCode));
    const heldRoles = new Set(grants.map((grant) => grant.roleCode));
    const needsOwner = roleCode === OWNER_ROLE || roleCode === ADMIN_ROLE;
    if (!permissions.has(permission) || (needsOwner && !heldRoles.has(OWNER_ROLE))) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
  }

  /**
   * Inserts the assignment in a transaction. A concurrent duplicate trips the partial unique
   * index `uq_user_role_user_role_branch` (SQLSTATE 23505) and is reported as 409, not 500
   * (BR-D1D-04); exactly one live row remains.
   */
  private async insertUnique(
    userId: string,
    role: RoleEntity,
    where: AssignmentBranch | null,
    actorId: string,
  ): Promise<UserRoleEntity> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        if (
          await this.userRoleRepository.existsLive(
            userId,
            role.id,
            where?.branchId ?? null,
            manager,
          )
        ) {
          throw new ConflictException('User sudah memiliki role tersebut di cabang ini');
        }
        return this.userRoleRepository.save(
          this.userRoleRepository.create({
            userId,
            roleId: role.id,
            tenantId: where?.tenantId ?? null,
            branchId: where?.branchId ?? null,
            createdBy: actorId,
            updatedBy: actorId,
          }),
          manager,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('User sudah memiliki role tersebut di cabang ini');
      }
      throw error;
    }
  }

  private async branchNamesOf(assignments: UserRoleEntity[]): Promise<Map<string, string>> {
    const ids = [
      ...new Set(assignments.map((a) => a.branchId).filter((id): id is string => id !== null)),
    ];
    if (ids.length === 0) return new Map();
    const branches = await this.branchService.findByIdsWithDeleted(ids);
    return new Map(branches.map((branch) => [branch.id, branch.name]));
  }
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; driverError?: { code?: string } } | null;
  return e?.code === PG_UNIQUE_VIOLATION || e?.driverError?.code === PG_UNIQUE_VIOLATION;
}
