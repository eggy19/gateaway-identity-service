import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity } from '../entities/session.entity';

/**
 * Read access to the Better Auth `session` table for session-management
 * endpoints. Session creation/revocation goes through the Better Auth API.
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
}
