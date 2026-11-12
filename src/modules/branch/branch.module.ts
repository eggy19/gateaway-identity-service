import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../tenant/tenant.module';
import { BranchEntity } from './entities/branch.entity';
import { BranchRepository } from './repositories/branch.repository';
import { BranchService } from './services/branch.service';

@Module({
  imports: [TypeOrmModule.forFeature([BranchEntity]), forwardRef(() => TenantModule)],
  providers: [BranchService, BranchRepository],
  exports: [BranchService],
})
export class BranchModule {}
