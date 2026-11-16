import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { RoleEntity } from '../entities/role.entity';
import { RoleScope } from '../enums/role-scope.enum';

/**
 * Which roles/permissions a caller may see (BR-D1D-11): the platform sees everything; any other
 * actor sees system roles plus their own tenant's roles, and never PLATFORM-scope roles.
 */
export type RoleVisibility = { platform: true } | { platform: false; tenantId: string | null };

/** Read-only data access for the role and permission catalogs (§8.4). */
@Injectable()
export class RoleRepository {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissions: Repository<PermissionEntity>,
  ) {}

  private visibleRoles(visibility: RoleVisibility): SelectQueryBuilder<RoleEntity> {
    const qb = this.roles.createQueryBuilder('r').where('r.deletedAt IS NULL');
    if (!visibility.platform) {
      qb.andWhere('(r.tenantId IS NULL OR r.tenantId = :tenantId)', {
        tenantId: visibility.tenantId,
      }).andWhere('r.scope <> :platformScope', { platformScope: RoleScope.Platform });
    }
    return qb;
  }

  findVisible(visibility: RoleVisibility): Promise<RoleEntity[]> {
    return this.visibleRoles(visibility).orderBy('r.code', 'ASC').getMany();
  }

  findVisibleById(id: string, visibility: RoleVisibility): Promise<RoleEntity | null> {
    return this.visibleRoles(visibility).andWhere('r.id = :id', { id }).getOne();
  }

  /** Live permissions granted to a role, ordered by code. */
  findPermissionsOfRole(roleId: string): Promise<PermissionEntity[]> {
    return this.permissions
      .createQueryBuilder('p')
      .innerJoin(RolePermissionEntity, 'rp', 'rp.permissionId = p.id AND rp.deletedAt IS NULL')
      .where('rp.roleId = :roleId', { roleId })
      .orderBy('p.code', 'ASC')
      .getMany();
  }

  /** Permission catalog; platform-only permissions are hidden from non-platform actors. */
  findAllPermissions(includePlatform: boolean): Promise<PermissionEntity[]> {
    const qb = this.permissions.createQueryBuilder('p').where('p.deletedAt IS NULL');
    if (!includePlatform) {
      qb.andWhere('p.isPlatform = :isPlatform', { isPlatform: false });
    }
    return qb.orderBy('p.code', 'ASC').getMany();
  }
}
