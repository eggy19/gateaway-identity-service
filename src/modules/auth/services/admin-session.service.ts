import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
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
    actor: ActorScope,
  ): Promise<PaginatedResult<AdminSessionResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const activeOnly = query.activeOnly !== 'false';

    // Non-platform actors only see sessions of users in their tenant (BR-D1C-02).
    const scopeUserIds = await this.userService.findUserIdsInScope(actor);
    if (
      scopeUserIds &&
      (scopeUserIds.length === 0 || (query.userId && !scopeUserIds.includes(query.userId)))
    ) {
      return buildPaginated([], 0, page, limit);
    }

    const [sessions, total] = await this.sessionRepository.findAllPaginated(
      { userId: query.userId, userIds: scopeUserIds ?? undefined, activeOnly },
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

  async revoke(sessionId: string, actor: ActorScope): Promise<void> {
    const session = await this.sessionRepository.findById(sessionId);
    // A session of a user outside the actor's tenant is reported as missing (BR-D1C-05).
    if (!session || !(await this.userService.isUserInScope(session.userId, actor))) {
      throw new NotFoundException('Session not found');
    }
    await this.sessionRepository.deleteById(sessionId);
    this.logger.log(`Admin revoked session ${sessionId} of user ${session.userId}`);
  }
}
