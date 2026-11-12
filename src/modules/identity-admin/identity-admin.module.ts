import { Module } from '@nestjs/common';
import { BranchModule } from '../branch/branch.module';
import { BranchController } from '../branch/controllers/branch.controller';
import { RoleModule } from '../role/role.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserController } from '../user/controllers/user.controller';
import { UserModule } from '../user/user.module';
import { BranchCreationService } from './services/branch-creation.service';
import { UserAdminService } from './services/user-admin.service';

/**
 * Hosts the Gateway admin endpoints that combine user/branch data with RBAC data
 * (G1, KP-22, KP-33). `RoleModule` already imports `UserModule` and `BranchModule`, so these
 * controllers and their orchestration services live here to avoid a module cycle.
 */
@Module({
  imports: [UserModule, BranchModule, TenantModule, RoleModule],
  controllers: [BranchController, UserController],
  providers: [UserAdminService, BranchCreationService],
})
export class IdentityAdminModule {}
