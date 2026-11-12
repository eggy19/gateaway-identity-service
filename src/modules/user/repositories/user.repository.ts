import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { UserStatus } from '../enums/user-status.enum';

/**
 * Read access to the Better Auth `user` table, plus limited writes to our own
 * non-credential profile fields (`name`, `status`). Credentials (email/password)
 * are always managed through the Better Auth API, never here.
 */
@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  findById(id: string, manager?: EntityManager): Promise<UserEntity | null> {
    return (manager ? manager.getRepository(UserEntity) : this.repository).findOne({
      where: { id },
    });
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { email } });
  }

  findAll(): Promise<UserEntity[]> {
    return this.repository.find({ order: { createdAt: 'DESC' } });
  }

  findByIds(ids: string[]): Promise<UserEntity[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.repository.find({ where: { id: In(ids) } });
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.repository.existsBy({ email });
  }

  async updateProfile(
    id: string,
    data: { name?: string; status?: UserStatus },
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ? manager.getRepository(UserEntity) : this.repository).update({ id }, data);
  }
}
