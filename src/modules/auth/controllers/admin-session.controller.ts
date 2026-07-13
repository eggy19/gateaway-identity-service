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
import { CurrentSession } from '../../../shared/auth/decorators/current-user.decorator';
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
  findAll(
    @Query() query: AdminSessionQueryDto,
    @CurrentSession() session: SessionInfo,
  ): Promise<PaginatedResult<AdminSessionResponseDto>> {
    return this.adminSessionService.list(query, session.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Session revoked')
  async revoke(@Param('id', ParseUUIDPipe) id: string): Promise<{ revoked: true }> {
    await this.adminSessionService.revoke(id);
    return { revoked: true };
  }
}
