import { Controller, Get, Query } from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { Actor } from '../../../shared/auth/decorators/actor.decorator';
import { RequirePermission } from '../../../shared/auth/decorators/require-permission.decorator';
import { PaginatedResult } from '../../../shared/responses/paginated';
import { LoginHistoryQueryDto } from '../dto/login-history-query.dto';
import { LoginHistoryResponseDto } from '../dto/login-history-response.dto';
import { LoginHistoryService } from '../services/login-history.service';

@Controller('admin/login-history')
export class LoginHistoryController {
  constructor(private readonly loginHistoryService: LoginHistoryService) {}

  @Get()
  @RequirePermission('identity.login_history.read')
  findAll(
    @Query() query: LoginHistoryQueryDto,
    @Actor() actor: ActorScope,
  ): Promise<PaginatedResult<LoginHistoryResponseDto>> {
    return this.loginHistoryService.search(query, actor);
  }
}
