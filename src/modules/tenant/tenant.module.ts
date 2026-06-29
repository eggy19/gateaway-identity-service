import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchModule } from '../branch/branch.module';
import { TenantController } from './controllers/tenant.controller';
import { TenantEntity } from './entities/tenant.entity';
import { TenantRepository } from './repositories/tenant.repository';
import { TenantService } from './services/tenant.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity]), forwardRef(() => BranchModule)],
  controllers: [TenantController],
  providers: [TenantService, TenantRepository],
  exports: [TenantService],
})
export class TenantModule {}
