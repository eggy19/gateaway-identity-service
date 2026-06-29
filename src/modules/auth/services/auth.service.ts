import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { Response } from 'express';
import { AUTH_INSTANCE } from '../../../shared/auth/auth.tokens';
import type { AuthInstance } from '../../../shared/auth/better-auth';
import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { SessionEntity } from '../../../shared/auth/entities/session.entity';
import { SessionRepository } from '../../../shared/auth/repositories/session.repository';
import { toWebHeaders } from '../../../shared/auth/http-headers.util';
import { UserStatus } from '../../user/enums/user-status.enum';
import { UserSecurityService } from '../../user/services/user-security.service';
import { UserService } from '../../user/services/user.service';
import { LoginDto } from '../dto/login.dto';
import { LoginHistoryEntity } from '../entities/login-history.entity';
import { LoginResult } from '../enums/login-result.enum';
import { LoginHistoryRepository } from '../repositories/login-history.repository';

export interface LoginContext {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: AuthInstance,
    private readonly userService: UserService,
    private readonly userSecurityService: UserSecurityService,
    private readonly loginHistoryRepository: LoginHistoryRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  /**
   * Login flow (Business Flow §1): validate the user, enforce account lock, then
   * delegate credential + session creation to Better Auth. Failures increment
   * the lockout counter; every attempt is recorded in login_history.
   */
  async login(dto: LoginDto, context: LoginContext, res: Response): Promise<UserEntity> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      await this.recordHistory(null, null, context, LoginResult.UserNotFound, 'User not found');
      throw new UnauthorizedException('Invalid email or password');
    }

    const branchContext = await this.userService.getPrimaryBranchContext(user.id);

    if ((user.status ?? UserStatus.Active) !== UserStatus.Active) {
      await this.recordHistory(
        user.id,
        branchContext,
        context,
        LoginResult.UserDisabled,
        'Account disabled',
      );
      throw new UnauthorizedException('Account is disabled');
    }

    const security = await this.userSecurityService.findByUserId(user.id);
    if (this.userSecurityService.isLocked(security)) {
      await this.recordHistory(
        user.id,
        branchContext,
        context,
        LoginResult.AccountLocked,
        'Account locked',
      );
      throw new UnauthorizedException('Account is temporarily locked. Try again later.');
    }

    try {
      const { headers } = await this.auth.api.signInEmail({
        body: { email: dto.email, password: dto.password },
        returnHeaders: true,
      });
      await this.userSecurityService.registerSuccessfulLogin(
        user.id,
        context.ipAddress,
        context.userAgent,
      );
      this.forwardCookies(headers, res);
      await this.recordHistory(user.id, branchContext, context, LoginResult.Success, null);
      return user;
    } catch {
      await this.userSecurityService.registerFailedAttempt(user.id);
      await this.recordHistory(
        user.id,
        branchContext,
        context,
        LoginResult.InvalidPassword,
        'Invalid password',
      );
      throw new UnauthorizedException('Invalid email or password');
    }
  }

  async logout(headers: IncomingHttpHeaders, res: Response): Promise<void> {
    const result = await this.auth.api.signOut({
      headers: toWebHeaders(headers),
      returnHeaders: true,
    });
    this.forwardCookies(result.headers, res);
  }

  listSessions(userId: string): Promise<SessionEntity[]> {
    return this.sessionRepository.findByUser(userId);
  }

  async revokeSession(
    sessionId: string,
    userId: string,
    headers: IncomingHttpHeaders,
  ): Promise<void> {
    const session = await this.sessionRepository.findByIdAndUser(sessionId, userId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    await this.auth.api.revokeSession({
      body: { token: session.token },
      headers: toWebHeaders(headers),
    });
  }

  private forwardCookies(headers: Headers, res: Response): void {
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) {
      res.setHeader('Set-Cookie', cookies);
    }
  }

  private async recordHistory(
    userId: string | null,
    branchContext: { tenantId: string; branchId: string } | null,
    context: LoginContext,
    result: LoginResult,
    failureReason: string | null,
  ): Promise<void> {
    const entity: Partial<LoginHistoryEntity> = {
      userId,
      tenantId: branchContext?.tenantId ?? null,
      branchId: branchContext?.branchId ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      loginResult: result,
      failureReason,
    };
    await this.loginHistoryRepository.save(this.loginHistoryRepository.create(entity));
  }
}
