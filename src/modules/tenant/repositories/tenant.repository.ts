import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { TenantEntity } from '../entities/tenant.entity';

/**
 * Data access for {@link TenantEntity}. All methods accept an optional
 * {@link EntityManager} so they can participate in a caller's transaction.
 */
@Injectable()
export class TenantRepository {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly repository: Repository<TenantEntity>,
  ) {}

  private scoped(manager?: EntityManager): Repository<TenantEntity> {
    return manager ? manager.getRepository(TenantEntity) : this.repository;
  }

  create(data: Partial<TenantEntity>): TenantEntity {
    return this.repository.create(data);
  }

  save(entity: TenantEntity, manager?: EntityManager): Promise<TenantEntity> {
    return this.scoped(manager).save(entity);
  }

  findById(id: string, manager?: EntityManager): Promise<TenantEntity | null> {
    return this.scoped(manager).findOne({ where: { id } });
  }

  /** Includes soft-deleted rows, so callers can tell "deleted" apart from "unknown". */
  findByIdsWithDeleted(ids: string[]): Promise<TenantEntity[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.repository.find({ where: { id: In(ids) }, withDeleted: true });
  }

  findAll(manager?: EntityManager): Promise<TenantEntity[]> {
    return this.scoped(manager).find({ order: { createdAt: 'DESC' } });
  }

  existsByCode(code: string, manager?: EntityManager): Promise<boolean> {
    return this.scoped(manager).existsBy({ code });
  }
}
