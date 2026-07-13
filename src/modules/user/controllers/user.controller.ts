import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../../../shared/auth/decorators/current-user.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import type { SessionUser } from '../../../shared/auth/auth.types';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { UserListItemResponseDto } from '../dto/user-list-item-response.dto';
import { UserDetailResponseDto } from '../dto/user-detail-response.dto';
import { UserMapper } from '../mappers/user.mapper';
import { UserService } from '../services/user.service';
import { UserSecurityService } from '../services/user-security.service';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userSecurityService: UserSecurityService,
  ) {}

  @Get()
  async findAll(): Promise<UserListItemResponseDto[]> {
    const contexts = await this.userService.findAllWithContext();
    return UserMapper.toListItemList(contexts);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserDetailResponseDto> {
    const detail = await this.userService.findDetail(id);
    return UserMapper.toDetail(detail);
  }

  @Post()
  @ResponseMessage('User created successfully')
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: SessionUser,
  ): Promise<UserResponseDto> {
    const created = await this.userService.create(dto, user.id);
    const branchIds = await this.userService.findBranchIds(created.id);
    return UserMapper.toResponse(created, branchIds);
  }

  @Put(':id')
  @ResponseMessage('User updated successfully')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.userService.updateProfile(id, dto);
    return UserMapper.toResponse(user);
  }

  @Patch(':id/status')
  @ResponseMessage('User status updated successfully')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    const user = await this.userService.updateStatus(id, dto);
    return UserMapper.toResponse(user);
  }

  @Post(':id/unlock')
  @ResponseMessage('User unlocked successfully')
  async unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<UserDetailResponseDto> {
    await this.userService.findByIdOrThrow(id);
    await this.userSecurityService.unlock(id, actor.id);
    const detail = await this.userService.findDetail(id);
    return UserMapper.toDetail(detail);
  }
}
