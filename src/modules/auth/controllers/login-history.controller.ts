import { Controller, Get, Query } from '@nestjs/common';
import { PaginatedResult } from '../../../shared/responses/paginated';
import { LoginHistoryQueryDto } from '../dto/login-history-query.dto';
import { LoginHistoryResponseDto } from '../dto/login-history-response.dto';
import { LoginHistoryService } from '../services/login-history.service';

@Controller('admin/login-history')
export class LoginHistoryController {
  constructor(private readonly loginHistoryService: LoginHistoryService) {}

  @Get()
  findAll(@Query() query: LoginHistoryQueryDto): Promise<PaginatedResult<LoginHistoryResponseDto>> {
    return this.loginHistoryService.search(query);
  }
}
