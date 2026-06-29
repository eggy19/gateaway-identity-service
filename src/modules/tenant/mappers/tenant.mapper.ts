import { TenantResponseDto } from '../dto/tenant-response.dto';
import { TenantEntity } from '../entities/tenant.entity';

export class TenantMapper {
  static toResponse(entity: TenantEntity): TenantResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      code: entity.code,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toResponseList(entities: TenantEntity[]): TenantResponseDto[] {
    return entities.map((entity) => TenantMapper.toResponse(entity));
  }
}
