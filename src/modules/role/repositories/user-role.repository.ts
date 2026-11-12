import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { UserStatus } from '../../user/enums/user-status.enum';
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

  private scoped(manager?: EntityManager): Repository<UserRoleEntity> {
    return manager ? manager.getRepository(UserRoleEntity) : this.repository;
  }

  create(data: Partial<UserRoleEntity>): UserRoleEntity {
    return this.repository.create(data);
  }

  save(entity: UserRoleEntity, manager?: EntityManager): Promise<UserRoleEntity> {
    return this.scoped(manager).save(entity);
  }

  /** Id of a live system role (`tenant_id IS NULL`) by code, or `null` when not seeded. */
  async findSystemRoleId(code: string, manager?: EntityManager): Promise<string | null> {
    const role = await (manager ?? this.repository.manager).getRepository(RoleEntity).findOne({
      where: { code, tenantId: IsNull() },
      select: { id: true },
    });
    return role?.id ?? null;
  }

  /** Which of `codes` the user holds through a live assignment of a live role (any branch). */
  async findHeldRoleCodes(
    userId: string,
    codes: string[],
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('ur')
      .select('DISTINCT r.code', 'role_code')
      .innerJoin(RoleEntity, 'r', 'r.id = ur.roleId AND r.deletedAt IS NULL')
      .where('ur.userId = :userId', { userId })
      .andWhere('ur.deletedAt IS NULL')
      .andWhere('r.code IN (:...codes)', { codes })
      .getRawMany<{ role_code: string }>();
    return rows.map((row) => row.role_code);
  }

  /** Tenants in which the user holds a live `OWNER` assignment. */
  async findOwnerTenantIds(userId: string, manager?: EntityManager): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('ur')
      .select('DISTINCT ur.tenantId', 'tenant_id')
      .innerJoin(RoleEntity, 'r', 'r.id = ur.roleId AND r.deletedAt IS NULL AND r.code = :owner', {
        owner: 'OWNER',
      })
      .where('ur.userId = :userId', { userId })
      .andWhere('ur.deletedAt IS NULL')
      .andWhere('ur.tenantId IS NOT NULL')
      .getRawMany<{ tenant_id: string }>();
    return rows.map((row) => row.tenant_id);
  }

  /** Number of users other than `excludeUserId` with an `active` status and a live `OWNER` in the tenant. */
  async countOtherActiveOwners(
    tenantId: string,
    excludeUserId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const row = await this.scoped(manager)
      .createQueryBuilder('ur')
      .select('COUNT(DISTINCT ur.userId)', 'count')
      .innerJoin(RoleEntity, 'r', 'r.id = ur.roleId AND r.deletedAt IS NULL AND r.code = :owner', {
        owner: 'OWNER',
      })
      .innerJoin(UserEntity, 'u', 'u.id = ur.userId AND u.status = :active', {
        active: UserStatus.Active,
      })
      .where('ur.tenantId = :tenantId', { tenantId })
      .andWhere('ur.userId <> :excludeUserId', { excludeUserId })
      .andWhere('ur.deletedAt IS NULL')
      .getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

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
