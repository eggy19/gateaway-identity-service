import {
  PermissionResponseDto,
  RoleDetailResponseDto,
  RoleResponseDto,
} from '../dto/role-response.dto';
import { PermissionEntity } from '../entities/permission.entity';
import { RoleEntity } from '../entities/role.entity';

export class RoleMapper {
  static toResponse(entity: RoleEntity): RoleResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      description: entity.description,
      scope: entity.scope,
      isSystem: entity.isSystem,
      status: entity.status,
    };
  }

  static toResponseList(entities: RoleEntity[]): RoleResponseDto[] {
    return entities.map((entity) => RoleMapper.toResponse(entity));
  }

  static toDetail(entity: RoleEntity, permissions: PermissionEntity[]): RoleDetailResponseDto {
    return { ...RoleMapper.toResponse(entity), permissions: permissions.map((p) => p.code) };
  }

  static toPermission(entity: PermissionEntity): PermissionResponseDto {
    return {
      code: entity.code,
      service: entity.service,
      resource: entity.resource,
      action: entity.action,
      description: entity.description,
    };
  }

  static toPermissionList(entities: PermissionEntity[]): PermissionResponseDto[] {
    return entities.map((entity) => RoleMapper.toPermission(entity));
  }
}
