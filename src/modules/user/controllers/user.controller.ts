import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { Actor } from '../../../shared/auth/decorators/actor.decorator';
import { RequirePermission } from '../../../shared/auth/decorators/require-permission.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import { UserAdminService } from '../../identity-admin/services/user-admin.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { UserListItemResponseDto } from '../dto/user-list-item-response.dto';
import { UserDetailResponseDto } from '../dto/user-detail-response.dto';
import { UserMapper } from '../mappers/user.mapper';
import { UserService } from '../services/user.service';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userAdminService: UserAdminService,
  ) {}

  @Get()
  @RequirePermission('identity.user.read')
  async findAll(@Actor() actor: ActorScope): Promise<UserListItemResponseDto[]> {
    const contexts = await this.userService.findAllWithContext(actor);
    return UserMapper.toListItemList(contexts);
  }

  @Get(':id')
  @RequirePermission('identity.user.read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorScope,
  ): Promise<UserDetailResponseDto> {
    const detail = await this.userService.findDetail(id, actor);
    return UserMapper.toDetail(detail);
  }

  @Post()
  @RequirePermission('identity.user.create')
  @ResponseMessage('User created successfully')
  async create(@Body() dto: CreateUserDto, @Actor() actor: ActorScope): Promise<UserResponseDto> {
    const created = await this.userService.create(dto, actor);
    const branchIds = await this.userService.findBranchIds(created.id);
    return UserMapper.toResponse(created, branchIds);
  }

  @Put(':id')
  @RequirePermission('identity.user.update')
  @ResponseMessage('User updated successfully')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Actor() actor: ActorScope,
  ): Promise<UserResponseDto> {
    const user = await this.userService.updateProfile(id, dto, actor);
    return UserMapper.toResponse(user);
  }

  @Patch(':id/status')
  @RequirePermission('identity.user.update')
  @ResponseMessage('User status updated successfully')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @Actor() actor: ActorScope,
  ): Promise<UserResponseDto> {
    const user = await this.userAdminService.updateStatus(id, dto, actor);
    return UserMapper.toResponse(user);
  }

  @Post(':id/unlock')
  @RequirePermission('identity.user.unlock')
  @ResponseMessage('User unlocked successfully')
  async unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorScope,
  ): Promise<UserDetailResponseDto> {
    const detail = await this.userAdminService.unlock(id, actor);
    return UserMapper.toDetail(detail);
  }
}
