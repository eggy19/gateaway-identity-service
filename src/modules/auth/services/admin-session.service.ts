import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SessionRepository } from '../../../shared/auth/repositories/session.repository';
import { buildPaginated, PaginatedResult } from '../../../shared/responses/paginated';
import { UserService } from '../../user/services/user.service';
import { AdminSessionQueryDto } from '../dto/admin-session-query.dto';
import { AdminSessionResponseDto } from '../dto/admin-session-response.dto';
import { AdminSessionMapper } from '../mappers/admin-session.mapper';

/**
 * Admin view over ALL users' sessions (the self-service SessionController only
 * exposes the caller's own). Revocation deletes the session row directly — see
 * the rationale on {@link SessionRepository}.
 */
@Injectable()
export class AdminSessionService {
  private readonly logger = new Logger(AdminSessionService.name);

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly userService: UserService,
  ) {}

  async list(
    query: AdminSessionQueryDto,
    currentSessionId: string,
  ): Promise<PaginatedResult<AdminSessionResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const activeOnly = query.activeOnly !== 'false';

    const [sessions, total] = await this.sessionRepository.findAllPaginated(
      { userId: query.userId, activeOnly },
      page,
      limit,
    );

    const userIds = [...new Set(sessions.map((session) => session.userId))];
    const users = await this.userService.findByIds(userIds);
    const userById = new Map(users.map((user) => [user.id, user]));

    const items = sessions.map((session) =>
      AdminSessionMapper.toResponse(session, userById.get(session.userId), currentSessionId),
    );
    return buildPaginated(items, total, page, limit);
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    await this.sessionRepository.deleteById(sessionId);
    this.logger.log(`Admin revoked session ${sessionId} of user ${session.userId}`);
  }
}
