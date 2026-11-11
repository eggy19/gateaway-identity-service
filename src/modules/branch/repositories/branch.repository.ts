import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { BranchEntity } from '../entities/branch.entity';

/**
 * Data access for {@link BranchEntity}. All methods accept an optional
 * {@link EntityManager} so they can participate in a caller's transaction.
 */
@Injectable()
export class BranchRepository {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly repository: Repository<BranchEntity>,
  ) {}

  private scoped(manager?: EntityManager): Repository<BranchEntity> {
    return manager ? manager.getRepository(BranchEntity) : this.repository;
  }

  create(data: Partial<BranchEntity>): BranchEntity {
    return this.repository.create(data);
  }

  save(entity: BranchEntity, manager?: EntityManager): Promise<BranchEntity> {
    return this.scoped(manager).save(entity);
  }

  findById(id: string, manager?: EntityManager): Promise<BranchEntity | null> {
    return this.scoped(manager).findOne({ where: { id } });
  }

  /** Includes soft-deleted rows, so callers can tell "deleted" apart from "unknown". */
  findByIdsWithDeleted(ids: string[]): Promise<BranchEntity[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.repository.find({ where: { id: In(ids) }, withDeleted: true });
  }

  findByTenant(tenantId: string, manager?: EntityManager): Promise<BranchEntity[]> {
    return this.scoped(manager).find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  findAll(manager?: EntityManager): Promise<BranchEntity[]> {
    return this.scoped(manager).find({ order: { createdAt: 'DESC' } });
  }

  existsByTenantAndCode(tenantId: string, code: string, manager?: EntityManager): Promise<boolean> {
    return this.scoped(manager).existsBy({ tenantId, code });
  }
}
