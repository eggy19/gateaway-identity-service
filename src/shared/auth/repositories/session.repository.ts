import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, MoreThan, Repository } from 'typeorm';
import { SessionEntity } from '../entities/session.entity';

export interface SessionListFilters {
  readonly userId?: string;
  readonly activeOnly: boolean;
}

/**
 * Access to the Better Auth `session` table for session-management endpoints.
 *
 * Self-service revocation goes through the Better Auth API (the caller owns
 * the session). Admin revocation deliberately deletes the row directly: the
 * Better Auth admin plugin would introduce role columns (RBAC is deferred),
 * and a deleted row invalidates the session immediately because SessionGuard
 * revalidates the cookie against this table on every request. The table is
 * Better Auth's and has no soft-delete columns; Better Auth itself hard
 * deletes on revoke, so this matches its semantics.
 */
@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly repository: Repository<SessionEntity>,
  ) {}

  findByUser(userId: string): Promise<SessionEntity[]> {
    return this.repository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  findByIdAndUser(id: string, userId: string): Promise<SessionEntity | null> {
    return this.repository.findOne({ where: { id, userId } });
  }

  findById(id: string): Promise<SessionEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  findAllPaginated(
    filters: SessionListFilters,
    page: number,
    limit: number,
  ): Promise<[SessionEntity[], number]> {
    const where: FindOptionsWhere<SessionEntity> = {};
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.activeOnly) {
      where.expiresAt = MoreThan(new Date());
    }
    return this.repository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}
