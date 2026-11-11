import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchModule } from '../branch/branch.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { UserRoleRepository } from './repositories/user-role.repository';
import { ActiveContextService } from './services/active-context.service';

/**
 * RBAC (T-13 schema, T-16b resolver): registers the role/permission entities and the
 * active-context resolver. Assign API and admin endpoints are added by later tasks.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, PermissionEntity, RolePermissionEntity, UserRoleEntity]),
    UserModule,
    TenantModule,
    BranchModule,
  ],
  providers: [UserRoleRepository, ActiveContextService],
  exports: [TypeOrmModule, ActiveContextService],
})
export class RoleModule {}
