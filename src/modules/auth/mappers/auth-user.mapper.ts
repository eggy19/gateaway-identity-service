import { UserEntity } from '../../../shared/auth/entities/user.entity';
import type { ActiveContext } from '../../role/services/active-context.service';
import { UserMapper } from '../../user/mappers/user.mapper';
import { AuthUserResponseDto } from '../dto/auth-user-response.dto';

/** Single mapper for login and `/auth/me` (BR-FE-01): old user fields + resolver output. */
export class AuthUserMapper {
  static toResponse(
    entity: UserEntity,
    branchIds: string[],
    active: ActiveContext,
  ): AuthUserResponseDto {
    return {
      ...UserMapper.toResponse(entity, branchIds),
      context: active.context,
      roles: active.roles,
      permissions: active.permissions,
      branches: active.branches,
    };
  }
}
