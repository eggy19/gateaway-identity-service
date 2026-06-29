import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../../../shared/auth/decorators/current-user.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import type { SessionUser } from '../../../shared/auth/auth.types';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { UserMapper } from '../mappers/user.mapper';
import { UserService } from '../services/user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.userService.findAll();
    return UserMapper.toResponseList(users);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.userService.findByIdOrThrow(id);
    const branchIds = await this.userService.findBranchIds(id);
    return UserMapper.toResponse(user, branchIds);
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
}
