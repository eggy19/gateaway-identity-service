import { UserRoleEntity } from '../../role/entities/user-role.entity';
import { UserRoleResponseDto } from '../dto/user-role-response.dto';

export class UserRoleMapper {
  /** `entity.role` must be loaded; `branchNames` maps branch id to its name. */
  static toResponse(
    entity: UserRoleEntity,
    branchNames: ReadonlyMap<string, string>,
  ): UserRoleResponseDto {
    return {
      id: entity.id,
      roleId: entity.roleId,
      roleCode: entity.role.code,
      roleName: entity.role.name,
      tenantId: entity.tenantId,
      branchId: entity.branchId,
      branchName: entity.branchId ? (branchNames.get(entity.branchId) ?? null) : null,
      assignedAt: entity.createdAt,
      assignedBy: entity.createdBy,
      revokedAt: entity.deletedAt,
      revokedBy: entity.deletedBy,
    };
  }

  static toResponseList(
    entities: UserRoleEntity[],
    branchNames: ReadonlyMap<string, string>,
  ): UserRoleResponseDto[] {
    return entities.map((entity) => UserRoleMapper.toResponse(entity, branchNames));
  }
}
