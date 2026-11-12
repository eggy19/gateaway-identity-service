import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { Actor } from '../../../shared/auth/decorators/actor.decorator';
import { CurrentSession } from '../../../shared/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../shared/auth/decorators/require-permission.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import type { SessionInfo } from '../../../shared/auth/auth.types';
import { PaginatedResult } from '../../../shared/responses/paginated';
import { AdminSessionQueryDto } from '../dto/admin-session-query.dto';
import { AdminSessionResponseDto } from '../dto/admin-session-response.dto';
import { AdminSessionService } from '../services/admin-session.service';

@Controller('admin/sessions')
export class AdminSessionController {
  constructor(private readonly adminSessionService: AdminSessionService) {}

  @Get()
  @RequirePermission('identity.session.read')
  findAll(
    @Query() query: AdminSessionQueryDto,
    @CurrentSession() session: SessionInfo,
    @Actor() actor: ActorScope,
  ): Promise<PaginatedResult<AdminSessionResponseDto>> {
    return this.adminSessionService.list(query, session.id, actor);
  }

  @Delete(':id')
  @RequirePermission('identity.session.revoke')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Session revoked')
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorScope,
  ): Promise<{ revoked: true }> {
    await this.adminSessionService.revoke(id, actor);
    return { revoked: true };
  }
}
