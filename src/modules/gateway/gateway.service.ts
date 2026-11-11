import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import type { Request } from 'express';
import type { GatewayConfig } from '../../config/configuration';
import type { SessionInfo, SessionUser } from '../../shared/auth/auth.types';
import { InternalJwtService } from '../../shared/internal-jwt/internal-jwt.service';
import { UserBranchRepository } from '../user/repositories/user-branch.repository';
import { GATEWAY_ROUTES } from './gateway-routes.config';

interface RequestWithId extends Request {
  requestId?: string;
}

/** Client headers never forwarded downstream (BR-M2-04, KP-16 denylist). */
export const BLOCKED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  'cookie',
  'host',
  'authorization',
  'proxy-authorization',
  'x-user-context',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'content-length',
  'content-encoding',
  'proxy-connection',
  'x-tenant-id',
  'x-branch-id',
  'x-user-id',
]);

export interface ForwardResult {
  status: number;
  data: unknown;
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly jwtService: InternalJwtService,
    private readonly userBranchRepo: UserBranchRepository,
    private readonly config: ConfigService,
  ) {}

  async forward(
    req: RequestWithId,
    user: SessionUser,
    session: SessionInfo,
    service: string,
  ): Promise<ForwardResult> {
    const startedAt = Date.now();
    const originalUrl = req.originalUrl ?? req.url;
    const apiPrefix = '/api/v1';

    // Reject dot-segments / internal paths before any context resolution or JWT signing.
    const rawPath = originalUrl.split(/[?#]/, 1)[0];
    this.assertPathAllowed(
      req,
      user,
      rawPath.startsWith(apiPrefix) ? rawPath.slice(apiPrefix.length) : rawPath,
    );

    const route = GATEWAY_ROUTES[service];
    if (!route) {
      throw new NotFoundException(`Unknown downstream service: ${service}`);
    }

    const { services } = this.config.getOrThrow<GatewayConfig>('gateway');
    const targetBase = services[service];
    if (!targetBase) {
      throw new ServiceUnavailableException(`Downstream service '${service}' is not configured`);
    }

    const userBranch = await this.userBranchRepo.findPrimaryByUserId(user.id);
    if (!userBranch) {
      throw new ForbiddenException('User has no branch assignment');
    }

    // Strip only /api/v1 — service name stays in the path sent to downstream.
    // e.g. client: /api/v1/inventory/items → downstream: /inventory/items
    const subPathAndQuery = originalUrl.startsWith(apiPrefix)
      ? originalUrl.slice(apiPrefix.length) || '/'
      : '/';

    const jwt = await this.jwtService.sign(
      {
        sub: user.id,
        tenantId: userBranch.branch.tenantId,
        branchId: userBranch.branchId,
        sessionId: session.id,
        requestId: req.requestId ?? '',
      },
      route.audience,
    );

    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (BLOCKED_REQUEST_HEADERS.has(key.toLowerCase())) continue;
      if (typeof value === 'string') {
        forwardHeaders[key] = value;
      } else if (Array.isArray(value)) {
        forwardHeaders[key] = value.join(', ');
      }
    }
    forwardHeaders['x-user-context'] = jwt;
    forwardHeaders['x-request-id'] = req.requestId ?? '';

    const targetUrl = `${targetBase}${subPathAndQuery}`;
    const tenantId = userBranch.branch.tenantId;

    try {
      const response = await this.httpService.axiosRef.request<unknown>({
        method: req.method,
        url: targetUrl,
        headers: forwardHeaders,
        data: req.body as unknown,
        validateStatus: () => true,
      });

      this.logProxy(
        response.status >= 500 ? 'warn' : 'debug',
        req,
        service,
        response.status,
        startedAt,
        user.id,
        tenantId,
      );

      return { status: response.status, data: response.data };
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        this.logProxy('error', req, service, 503, startedAt, user.id, tenantId);
        throw new ServiceUnavailableException(`Downstream service '${service}' is unavailable`);
      }
      throw err;
    }
  }

  /** BR-M2-01..03: normalise sub-path, reject dot-segments (400) and `internal` segments (404). */
  private assertPathAllowed(req: RequestWithId, user: SessionUser, subPath: string): void {
    let segments: string[];
    try {
      segments = subPath
        .split('/')
        .flatMap((segment) => decodeURIComponent(segment).split(/[/\\]/))
        .map((segment) => segment.toLowerCase());
    } catch {
      throw new BadRequestException('Invalid request path');
    }

    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new BadRequestException('Invalid request path');
    }

    if (segments.includes('internal')) {
      this.logger.warn(
        `Blocked internal path method=${req.method} path=${this.pathOnly(req)} userId=${user.id} requestId=${req.requestId ?? ''}`,
      );
      throw new NotFoundException('Not Found');
    }
  }

  /** BR-M1-02: one summary line per proxied request; no body, query string, or headers. */
  private logProxy(
    level: 'debug' | 'warn' | 'error',
    req: RequestWithId,
    service: string,
    status: number,
    startedAt: number,
    userId: string,
    tenantId: string,
  ): void {
    this.logger[level](
      `proxy service=${service} method=${req.method} path=${this.pathOnly(req)} status=${status} durationMs=${Date.now() - startedAt} requestId=${req.requestId ?? ''} userId=${userId} tenantId=${tenantId}`,
    );
  }

  private pathOnly(req: RequestWithId): string {
    return (req.originalUrl ?? req.url).split(/[?#]/, 1)[0];
  }
}
