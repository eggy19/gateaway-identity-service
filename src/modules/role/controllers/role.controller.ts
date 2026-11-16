import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { Actor } from '../../../shared/auth/decorators/actor.decorator';
import { RequirePermission } from '../../../shared/auth/decorators/require-permission.decorator';
import {
  PermissionResponseDto,
  RoleDetailResponseDto,
  RoleResponseDto,
} from '../dto/role-response.dto';
import { RoleMapper } from '../mappers/role.mapper';
import { RoleService } from '../services/role.service';

/** Read-only role/permission catalog. No create/update/delete routes exist (BR-D1A-04, AC-D1D-13). */
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermission('identity.role.read')
  async findAll(@Actor() actor: ActorScope): Promise<RoleResponseDto[]> {
    return RoleMapper.toResponseList(await this.roleService.findAll(actor));
  }

  @Get(':id')
  @RequirePermission('identity.role.read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorScope,
  ): Promise<RoleDetailResponseDto> {
    const { role, permissions } = await this.roleService.findDetail(id, actor);
    return RoleMapper.toDetail(role, permissions);
  }
}

@Controller('permissions')
export class PermissionController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermission('identity.role.read')
  async findAll(@Actor() actor: ActorScope): Promise<PermissionResponseDto[]> {
    return RoleMapper.toPermissionList(await this.roleService.findAllPermissions(actor));
  }
}
