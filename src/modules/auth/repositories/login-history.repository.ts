import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginHistoryEntity } from '../entities/login-history.entity';

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
}
