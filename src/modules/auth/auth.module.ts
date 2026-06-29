import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from '../../shared/auth/entities/session.entity';
import { SessionRepository } from '../../shared/auth/repositories/session.repository';
import { UserModule } from '../user/user.module';
import { AuthController } from './controllers/auth.controller';
import { SessionController } from './controllers/session.controller';
import { LoginHistoryEntity } from './entities/login-history.entity';
import { LoginHistoryRepository } from './repositories/login-history.repository';
import { AuthService } from './services/auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([LoginHistoryEntity, SessionEntity]), UserModule],
  controllers: [AuthController, SessionController],
  providers: [AuthService, LoginHistoryRepository, SessionRepository],
})
export class AuthModule {}
