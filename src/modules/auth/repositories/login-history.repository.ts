import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginHistoryEntity } from '../entities/login-history.entity';
import { LoginResult } from '../enums/login-result.enum';

export interface LoginHistoryFilters {
  readonly userId?: string;
  readonly tenantId?: string;
  readonly branchId?: string;
  readonly loginResult?: LoginResult;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
}

@Injectable()
export class LoginHistoryRepository {
  constructor(
    @InjectRepository(LoginHistoryEntity)
    private readonly repository: Repository<LoginHistoryEntity>,
  ) {}

  create(data: Partial<LoginHistoryEntity>): LoginHistoryEntity {
    return this.repository.create(data);
  }

  save(entity: LoginHistoryEntity): Promise<LoginHistoryEntity> {
    return this.repository.save(entity);
  }

  findByUser(userId: string, limit = 50): Promise<LoginHistoryEntity[]> {
    return this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** Filtered, paginated audit search (uses the (user_id, created_at) index). */
  search(
    filters: LoginHistoryFilters,
    page: number,
    limit: number,
  ): Promise<[LoginHistoryEntity[], number]> {
    const qb = this.repository.createQueryBuilder('history');
    if (filters.userId) {
      qb.andWhere('history.userId = :userId', { userId: filters.userId });
    }
    if (filters.tenantId) {
      qb.andWhere('history.tenantId = :tenantId', { tenantId: filters.tenantId });
    }
    if (filters.branchId) {
      qb.andWhere('history.branchId = :branchId', { branchId: filters.branchId });
    }
    if (filters.loginResult) {
      qb.andWhere('history.loginResult = :loginResult', { loginResult: filters.loginResult });
    }
    if (filters.dateFrom) {
      qb.andWhere('history.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('history.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }
    return qb
      .orderBy('history.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }
}
