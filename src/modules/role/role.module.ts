import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../shared/auth/guards/permission.guard';
import { BranchModule } from '../branch/branch.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { PermissionController, RoleController } from './controllers/role.controller';
import { RoleRepository } from './repositories/role.repository';
import { UserRoleRepository } from './repositories/user-role.repository';
import { ActiveContextService } from './services/active-context.service';
import { RoleService } from './services/role.service';

/**
 * RBAC (T-13 schema, T-16b resolver): registers the role/permission entities, the
 * active-context resolver, and the read-only role/permission catalog (T-22). Assign/revoke
 * lives in `IdentityAdminModule` because it also needs user and branch data.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, PermissionEntity, RolePermissionEntity, UserRoleEntity]),
    UserModule,
    TenantModule,
    BranchModule,
  ],
  controllers: [RoleController, PermissionController],
  // PermissionGuard must be registered after SessionGuard (AuthCoreModule is scanned first).
  providers: [
    UserRoleRepository,
    RoleRepository,
    ActiveContextService,
    RoleService,
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [TypeOrmModule, ActiveContextService, UserRoleRepository, RoleRepository, RoleService],
})
export class RoleModule {}
