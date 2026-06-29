import { SessionEntity } from '../../../shared/auth/entities/session.entity';
import { SessionResponseDto } from '../dto/session-response.dto';

export class SessionMapper {
  static toResponse(entity: SessionEntity, currentSessionId?: string): SessionResponseDto {
    return {
      id: entity.id,
      userId: entity.userId,
      expiresAt: entity.expiresAt,
      ipAddress: entity.ipAddress,
      userAgent: entity.userAgent,
      createdAt: entity.createdAt,
      current: entity.id === currentSessionId,
    };
  }

  static toResponseList(
    entities: SessionEntity[],
    currentSessionId?: string,
  ): SessionResponseDto[] {
    return entities.map((entity) => SessionMapper.toResponse(entity, currentSessionId));
  }
}
