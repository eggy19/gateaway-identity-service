import { BranchEntity } from '../../branch/entities/branch.entity';
import { TenantEntity } from '../../tenant/entities/tenant.entity';
import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { LoginHistoryEntity } from '../entities/login-history.entity';
import { LoginHistoryResponseDto } from '../dto/login-history-response.dto';

export interface LoginHistoryLookups {
  readonly userById: ReadonlyMap<string, UserEntity>;
  readonly tenantById: ReadonlyMap<string, TenantEntity>;
  readonly branchById: ReadonlyMap<string, BranchEntity>;
}

export class LoginHistoryMapper {
  static toResponse(
    entity: LoginHistoryEntity,
    lookups: LoginHistoryLookups,
  ): LoginHistoryResponseDto {
    const user = entity.userId ? lookups.userById.get(entity.userId) : undefined;
    const tenant = entity.tenantId ? lookups.tenantById.get(entity.tenantId) : undefined;
    const branch = entity.branchId ? lookups.branchById.get(entity.branchId) : undefined;
    return {
      id: entity.id,
      userId: entity.userId,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      tenantId: entity.tenantId,
      tenantName: tenant?.name ?? null,
      branchId: entity.branchId,
      branchName: branch?.name ?? null,
      ipAddress: entity.ipAddress,
      userAgent: entity.userAgent,
      loginResult: entity.loginResult,
      failureReason: entity.failureReason,
      createdAt: entity.createdAt,
    };
  }

  static toResponseList(
    entities: LoginHistoryEntity[],
    lookups: LoginHistoryLookups,
  ): LoginHistoryResponseDto[] {
    return entities.map((entity) => LoginHistoryMapper.toResponse(entity, lookups));
  }
}
