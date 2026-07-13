import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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

  findAll(): Promise<UserBranchEntity[]> {
    return this.repository.find();
  }

  existsByUserAndBranch(userId: string, branchId: string): Promise<boolean> {
    return this.repository.existsBy({ userId, branchId });
  }

  async findPrimaryByUserId(userId: string): Promise<UserBranchEntity | null> {
    const primary = await this.repository.findOne({
      where: { userId, isPrimary: true },
      relations: { branch: true },
    });
    if (primary) return primary;
    return this.repository.findOne({
      where: { userId },
      relations: { branch: true },
      order: { createdAt: 'ASC' },
    });
  }
}
