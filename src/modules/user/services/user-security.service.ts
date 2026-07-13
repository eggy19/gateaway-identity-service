import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthConfig } from '../../../config/configuration';
import { UserSecurityEntity } from '../entities/user-security.entity';
import { UserSecurityRepository } from '../repositories/user-security.repository';

const MINUTE_MS = 60_000;
const LOCK_REASON = 'Too many failed login attempts';

/**
 * Encapsulates account-lockout state on {@link UserSecurityEntity}
 * (Business Rules: failed-login counter, temporary lock).
 */
@Injectable()
export class UserSecurityService {
  constructor(
    private readonly userSecurityRepository: UserSecurityRepository,
    private readonly configService: ConfigService,
  ) {}

  findByUserId(userId: string): Promise<UserSecurityEntity | null> {
    return this.userSecurityRepository.findByUserId(userId);
  }

  isLocked(security: UserSecurityEntity | null): boolean {
    return !!security?.blockUntil && security.blockUntil.getTime() > Date.now();
  }

  /** Increments the failed-login counter, locking the account at the threshold. */
  async registerFailedAttempt(userId: string): Promise<void> {
    const security = await this.userSecurityRepository.findByUserId(userId);
    if (!security) {
      return;
    }
    const { maxFailedAttempts, lockDurationMinutes } =
      this.configService.getOrThrow<AuthConfig>('auth');

    security.failedLoginCount += 1;
    security.lastFailedLoginAt = new Date();
    if (security.failedLoginCount >= maxFailedAttempts) {
      security.blockUntil = new Date(Date.now() + lockDurationMinutes * MINUTE_MS);
      security.lockReason = LOCK_REASON;
    }
    await this.userSecurityRepository.save(security);
  }

  findAll(): Promise<UserSecurityEntity[]> {
    return this.userSecurityRepository.findAll();
  }

  /** Admin unlock: clears the lock and failed-login counter so the user can log in again. */
  async unlock(userId: string, actorId: string): Promise<void> {
    const security = await this.userSecurityRepository.findByUserId(userId);
    if (!security) {
      throw new NotFoundException(`Security record for user ${userId} not found`);
    }
    security.failedLoginCount = 0;
    security.blockUntil = null;
    security.lockReason = null;
    security.updatedBy = actorId;
    await this.userSecurityRepository.save(security);
  }

  /** Resets the counter and records the successful login (Business Flow §1). */
  async registerSuccessfulLogin(
    userId: string,
    ipAddress: string | null,
    device: string | null,
  ): Promise<void> {
    const security = await this.userSecurityRepository.findByUserId(userId);
    if (!security) {
      return;
    }
    security.failedLoginCount = 0;
    security.blockUntil = null;
    security.lockReason = null;
    security.lastLoginAt = new Date();
    security.lastLoginIp = ipAddress;
    security.lastLoginDevice = device;
    await this.userSecurityRepository.save(security);
  }
}
