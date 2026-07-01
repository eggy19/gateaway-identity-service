import {
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
    const originalUrl = req.originalUrl ?? req.url;
    const apiPrefix = '/api/v1';
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
      const lower = key.toLowerCase();
      if (lower === 'cookie' || lower === 'host') continue;
      if (typeof value === 'string') {
        forwardHeaders[key] = value;
      } else if (Array.isArray(value)) {
        forwardHeaders[key] = value.join(', ');
      }
    }
    forwardHeaders['x-user-context'] = jwt;
    forwardHeaders['x-request-id'] = req.requestId ?? '';

    const targetUrl = `${targetBase}${subPathAndQuery}`;
    this.logger.log(`Proxying ${req.method} ${req.url} → ${targetUrl} [aud=${route.audience}]`);

    try {
      const response = await this.httpService.axiosRef.request<unknown>({
        method: req.method,
        url: targetUrl,
        headers: forwardHeaders,
        data: req.body as unknown,
        validateStatus: () => true,
      });

      this.logger.log(`Forwarded request to ${service} (${targetUrl}) with status ${response.status}`);
      this.logger.log(`response data: ${JSON.stringify(response.data)}`);
    
      return { status: response.status, data: response.data };
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        throw new ServiceUnavailableException(`Downstream service '${service}' is unavailable`);
      }
      throw err;
    }
  }
}
