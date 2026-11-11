import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { RoleEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { RoleScope } from '../enums/role-scope.enum';
import { RoleStatus } from '../enums/role-status.enum';

/** One (role, permission) pair granted to a user; `permissionCode` is null for a role without permissions. */
export interface EffectiveGrantRow {
  readonly roleCode: string;
  readonly roleScope: RoleScope;
  readonly permissionCode: string | null;
}

interface RawGrantRow {
  role_code: string;
  role_scope: RoleScope;
  permission_code: string | null;
}

/** Data access for {@link UserRoleEntity} (RBAC read side used by the active-context resolver). */
@Injectable()
export class UserRoleRepository {
  constructor(
    @InjectRepository(UserRoleEntity)
    private readonly repository: Repository<UserRoleEntity>,
  ) {}

  /**
   * Effective grants of a user in the given active tenant/branch (BR-D1B-10): only live
   * `user_role`, active live `role`, live `role_permission`/`permission`, and scope-consistent
   * rows (BRANCH role -> same tenant+branch; PLATFORM role -> NULL tenant and branch).
   * Uses `idx_user_role_user_branch` (user_id prefix).
   */
  async findEffectiveGrants(
    userId: string,
    tenantId: string | null,
    branchId: string | null,
  ): Promise<EffectiveGrantRow[]> {
    const rows = await this.repository
      .createQueryBuilder('ur')
      .select('r.code', 'role_code')
      .addSelect('r.scope', 'role_scope')
      .addSelect('p.code', 'permission_code')
      .innerJoin(
        RoleEntity,
        'r',
        'r.id = ur.roleId AND r.deletedAt IS NULL AND r.status = :active',
        {
          active: RoleStatus.Active,
        },
      )
      .leftJoin(RolePermissionEntity, 'rp', 'rp.roleId = r.id AND rp.deletedAt IS NULL')
      .leftJoin(PermissionEntity, 'p', 'p.id = rp.permissionId AND p.deletedAt IS NULL')
      .where('ur.userId = :userId', { userId })
      .andWhere('ur.deletedAt IS NULL')
      .andWhere(
        '((r.scope = :branchScope AND ur.branchId = :branchId AND ur.tenantId = :tenantId)' +
          ' OR (r.scope = :platformScope AND ur.tenantId IS NULL AND ur.branchId IS NULL))',
        {
          branchScope: RoleScope.Branch,
          platformScope: RoleScope.Platform,
          branchId,
          tenantId,
        },
      )
      .getRawMany<RawGrantRow>();

    return rows.map((row) => ({
      roleCode: row.role_code,
      roleScope: row.role_scope,
      permissionCode: row.permission_code,
    }));
  }
}
