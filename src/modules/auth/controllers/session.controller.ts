import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  CurrentSession,
  CurrentUser,
} from '../../../shared/auth/decorators/current-user.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import type { SessionInfo, SessionUser } from '../../../shared/auth/auth.types';
import { SessionResponseDto } from '../dto/session-response.dto';
import { SessionMapper } from '../mappers/session.mapper';
import { AuthService } from '../services/auth.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  async findAll(
    @CurrentUser() user: SessionUser,
    @CurrentSession() session: SessionInfo,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.authService.listSessions(user.id);
    return SessionMapper.toResponseList(sessions, session.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Session revoked')
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ): Promise<{ revoked: true }> {
    await this.authService.revokeSession(id, user.id, req.headers);
    return { revoked: true };
  }
}
