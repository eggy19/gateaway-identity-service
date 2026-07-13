import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from '../../shared/auth/entities/session.entity';
import { SessionRepository } from '../../shared/auth/repositories/session.repository';
import { BranchModule } from '../branch/branch.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './controllers/auth.controller';
import { SessionController } from './controllers/session.controller';
import { AdminSessionController } from './controllers/admin-session.controller';
import { LoginHistoryController } from './controllers/login-history.controller';
import { LoginHistoryEntity } from './entities/login-history.entity';
import { LoginHistoryRepository } from './repositories/login-history.repository';
import { AuthService } from './services/auth.service';
import { AdminSessionService } from './services/admin-session.service';
import { LoginHistoryService } from './services/login-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LoginHistoryEntity, SessionEntity]),
    UserModule,
    TenantModule,
    BranchModule,
  ],
  controllers: [AuthController, SessionController, AdminSessionController, LoginHistoryController],
  providers: [
    AuthService,
    AdminSessionService,
    LoginHistoryService,
    LoginHistoryRepository,
    SessionRepository,
  ],
})
export class AuthModule {}
