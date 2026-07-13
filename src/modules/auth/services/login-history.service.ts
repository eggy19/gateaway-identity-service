import { Injectable } from '@nestjs/common';
import { buildPaginated, PaginatedResult } from '../../../shared/responses/paginated';
import { BranchService } from '../../branch/services/branch.service';
import { TenantService } from '../../tenant/services/tenant.service';
import { UserService } from '../../user/services/user.service';
import { LoginHistoryQueryDto } from '../dto/login-history-query.dto';
import { LoginHistoryResponseDto } from '../dto/login-history-response.dto';
import { LoginHistoryMapper } from '../mappers/login-history.mapper';
import {
  LoginHistoryFilters,
  LoginHistoryRepository,
} from '../repositories/login-history.repository';

/** Read side of the login audit for the admin screen (filter + paginate + enrich names). */
@Injectable()
export class LoginHistoryService {
  constructor(
    private readonly loginHistoryRepository: LoginHistoryRepository,
    private readonly userService: UserService,
    private readonly tenantService: TenantService,
    private readonly branchService: BranchService,
  ) {}

  async search(query: LoginHistoryQueryDto): Promise<PaginatedResult<LoginHistoryResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [entities, total] = await this.loginHistoryRepository.search(
      this.buildFilters(query),
      page,
      limit,
    );

    const userIds = [
      ...new Set(entities.map((entity) => entity.userId).filter((id): id is string => !!id)),
    ];
    const [users, tenants, branches] = await Promise.all([
      this.userService.findByIds(userIds),
      this.tenantService.findAll(),
      this.branchService.findAll(),
    ]);

    const items = LoginHistoryMapper.toResponseList(entities, {
      userById: new Map(users.map((user) => [user.id, user])),
      tenantById: new Map(tenants.map((tenant) => [tenant.id, tenant])),
      branchById: new Map(branches.map((branch) => [branch.id, branch])),
    });
    return buildPaginated(items, total, page, limit);
  }

  private buildFilters(query: LoginHistoryQueryDto): LoginHistoryFilters {
    return {
      userId: query.userId,
      tenantId: query.tenantId,
      branchId: query.branchId,
      loginResult: query.loginResult,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? this.toEndOfDay(query.dateTo) : undefined,
    };
  }

  /** A date-only upper bound is inclusive: "2026-07-07" means end of that day. */
  private toEndOfDay(value: string): Date {
    const date = new Date(value);
    if (value.length === 10) {
      date.setHours(23, 59, 59, 999);
    }
    return date;
  }
}
