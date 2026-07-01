import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../../shared/auth/entities/user.entity';
import { BranchModule } from '../branch/branch.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserController } from './controllers/user.controller';
import { UserBranchEntity } from './entities/user-branch.entity';
import { UserSecurityEntity } from './entities/user-security.entity';
import { UserBranchRepository } from './repositories/user-branch.repository';
import { UserRepository } from './repositories/user.repository';
import { UserSecurityRepository } from './repositories/user-security.repository';
import { UserSecurityService } from './services/user-security.service';
import { UserService } from './services/user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, UserSecurityEntity, UserBranchEntity]),
    TenantModule,
    BranchModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    UserSecurityService,
    UserRepository,
    UserSecurityRepository,
    UserBranchRepository,
  ],
  exports: [UserService, UserSecurityService, UserBranchRepository],
})
export class UserModule {}
