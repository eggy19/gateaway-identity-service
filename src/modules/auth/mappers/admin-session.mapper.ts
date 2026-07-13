import { SessionEntity } from '../../../shared/auth/entities/session.entity';
import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { AdminSessionResponseDto } from '../dto/admin-session-response.dto';

export class AdminSessionMapper {
  static toResponse(
    entity: SessionEntity,
    user: UserEntity | undefined,
    currentSessionId?: string,
  ): AdminSessionResponseDto {
    return {
      id: entity.id,
      userId: entity.userId,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      ipAddress: entity.ipAddress,
      userAgent: entity.userAgent,
      createdAt: entity.createdAt,
      expiresAt: entity.expiresAt,
      current: entity.id === currentSessionId,
    };
  }
}
