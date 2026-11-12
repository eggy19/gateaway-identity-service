import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { UserBranchEntity } from '../entities/user-branch.entity';

/**
 * Data access for {@link UserBranchEntity} (user ↔ branch assignments). Methods
 * accept an optional {@link EntityManager} so they can join a caller's transaction.
 */
@Injectable()
export class UserBranchRepository {
  constructor(
    @InjectRepository(UserBranchEntity)
    private readonly repository: Repository<UserBranchEntity>,
  ) {}

  private scoped(manager?: EntityManager): Repository<UserBranchEntity> {
    return manager ? manager.getRepository(UserBranchEntity) : this.repository;
  }

  create(data: Partial<UserBranchEntity>): UserBranchEntity {
    return this.repository.create(data);
  }

  save(entity: UserBranchEntity, manager?: EntityManager): Promise<UserBranchEntity> {
    return this.scoped(manager).save(entity);
  }

  findByUser(userId: string, manager?: EntityManager): Promise<UserBranchEntity[]> {
    return this.scoped(manager).find({ where: { userId } });
  }

  /** Live assignments to any of the given branches (tenant scope lookups). */
  findByBranchIds(branchIds: string[]): Promise<UserBranchEntity[]> {
    if (branchIds.length === 0) return Promise.resolve([]);
    return this.repository.find({ where: { branchId: In(branchIds) } });
  }

  findAll(): Promise<UserBranchEntity[]> {
    return this.repository.find();
  }

  existsByUserAndBranch(userId: string, branchId: string): Promise<boolean> {
    return this.repository.existsBy({ userId, branchId });
  }
}
