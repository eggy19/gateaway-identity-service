import { All, Controller, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionInfo, SessionUser } from '../../shared/auth/auth.types';
import { CurrentSession, CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { PermissionExempt } from '../../shared/auth/decorators/require-permission.decorator';
import { GatewayService } from './gateway.service';

/**
 * Wildcard controller that proxies authenticated requests to downstream services.
 * Must be registered LAST in AppModule so it does not shadow specific routes.
 *
 * Flow: SessionGuard validates cookie → controller extracts service prefix →
 * GatewayService signs Internal JWT → forwards request to downstream.
 *
 * Exempt from the Gateway permission guard: permissions of proxied routes are enforced by
 * the downstream service (BR-D1B-09).
 */
@PermissionExempt()
@Controller(':service')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @All('*')
  async forward(
    @Req() req: Request,
    @Res() res: Response,
    @Param('service') service: string,
    @CurrentUser() user: SessionUser,
    @CurrentSession() session: SessionInfo,
  ): Promise<void> {
    const { status, data } = await this.gatewayService.forward(req, user, session, service);
    res.status(status).json(data);
  }
}
