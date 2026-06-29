import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { UserResponseDto } from '../dto/user-response.dto';
import { UserStatus } from '../enums/user-status.enum';

export class UserMapper {
  static toResponse(entity: UserEntity, branchIds?: string[]): UserResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      emailVerified: entity.emailVerified,
      status: entity.status ?? UserStatus.Active,
      branchIds,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toResponseList(entities: UserEntity[]): UserResponseDto[] {
    return entities.map((entity) => UserMapper.toResponse(entity));
  }
}
