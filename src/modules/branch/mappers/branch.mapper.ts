import { BranchResponseDto } from '../dto/branch-response.dto';
import { BranchEntity } from '../entities/branch.entity';

export class BranchMapper {
  static toResponse(entity: BranchEntity): BranchResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      code: entity.code,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toResponseList(entities: BranchEntity[]): BranchResponseDto[] {
    return entities.map((entity) => BranchMapper.toResponse(entity));
  }
}
