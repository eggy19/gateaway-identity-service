import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserSecurityEntity } from '../entities/user-security.entity';

/**
 * Data access for {@link UserSecurityEntity}. Methods accept an optional
 * {@link EntityManager} so they can join a caller's transaction.
 */
@Injectable()
export class UserSecurityRepository {
  constructor(
    @InjectRepository(UserSecurityEntity)
    private readonly repository: Repository<UserSecurityEntity>,
  ) {}

  private scoped(manager?: EntityManager): Repository<UserSecurityEntity> {
    return manager ? manager.getRepository(UserSecurityEntity) : this.repository;
  }

  create(data: Partial<UserSecurityEntity>): UserSecurityEntity {
    return this.repository.create(data);
  }

  save(entity: UserSecurityEntity, manager?: EntityManager): Promise<UserSecurityEntity> {
    return this.scoped(manager).save(entity);
  }

  findByUserId(userId: string, manager?: EntityManager): Promise<UserSecurityEntity | null> {
    return this.scoped(manager).findOne({ where: { userId } });
  }
}
