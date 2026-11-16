import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { Actor } from '../../../shared/auth/decorators/actor.decorator';
import { RequirePermission } from '../../../shared/auth/decorators/require-permission.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import { AssignUserRoleDto } from '../dto/assign-user-role.dto';
import { UserRoleQueryDto } from '../dto/user-role-query.dto';
import { RevokeUserRoleResponseDto, UserRoleResponseDto } from '../dto/user-role-response.dto';
import { UserRoleMapper } from '../mappers/user-role.mapper';
import { UserRoleAdminService } from '../services/user-role-admin.service';

/**
 * Role assignments per user (T-22, §8.4). There is no PUT/PATCH: an assignment is never edited,
 * only revoked (soft delete) and re-created (BR-D1A-09, AC-D1D-12).
 */
@Controller('users/:id/roles')
export class UserRoleController {
  constructor(private readonly userRoleAdminService: UserRoleAdminService) {}

  @Get()
  @RequirePermission('identity.user_role.read')
  async findAll(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: UserRoleQueryDto,
    @Actor() actor: ActorScope,
  ): Promise<UserRoleResponseDto[]> {
    const { assignments, branchNames } = await this.userRoleAdminService.list(
      id,
      query.includeRevoked === 'true',
      actor,
    );
    return UserRoleMapper.toResponseList(assignments, branchNames);
  }

  @Post()
  @RequirePermission('identity.user_role.assign')
  @ResponseMessage('Role assigned successfully')
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserRoleDto,
    @Actor() actor: ActorScope,
  ): Promise<UserRoleResponseDto> {
    const { assignments, branchNames } = await this.userRoleAdminService.assign(id, dto, actor);
    return UserRoleMapper.toResponse(assignments[0], branchNames);
  }

  @Delete(':assignmentId')
  @RequirePermission('identity.user_role.revoke')
  @ResponseMessage('Role revoked successfully')
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Actor() actor: ActorScope,
  ): Promise<RevokeUserRoleResponseDto> {
    await this.userRoleAdminService.revoke(id, assignmentId, actor);
    return { revoked: true };
  }
}
