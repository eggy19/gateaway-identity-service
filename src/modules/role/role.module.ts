import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';

/**
 * RBAC schema (T-13): registers the role/permission entities. Repositories,
 * services, and endpoints are added by the following tasks (resolver, assign API).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, PermissionEntity, RolePermissionEntity, UserRoleEntity]),
  ],
  exports: [TypeOrmModule],
})
export class RoleModule {}
