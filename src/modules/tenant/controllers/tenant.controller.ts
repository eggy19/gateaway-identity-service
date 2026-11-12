import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { Actor } from '../../../shared/auth/decorators/actor.decorator';
import { CurrentUser } from '../../../shared/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../shared/auth/decorators/require-permission.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import type { SessionUser } from '../../../shared/auth/auth.types';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { TenantResponseDto } from '../dto/tenant-response.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { TenantMapper } from '../mappers/tenant.mapper';
import { TenantService } from '../services/tenant.service';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @RequirePermission('identity.tenant.read')
  async findAll(@Actor() actor: ActorScope): Promise<TenantResponseDto[]> {
    const tenants = await this.tenantService.findAllInScope(actor);
    return TenantMapper.toResponseList(tenants);
  }

  @Get(':id')
  @RequirePermission('identity.tenant.read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorScope,
  ): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.findByIdInScopeOrThrow(id, actor);
    return TenantMapper.toResponse(tenant);
  }

  @Post()
  @RequirePermission('identity.tenant.create')
  @ResponseMessage('Tenant created successfully')
  async create(
    @Body() dto: CreateTenantDto,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.create(dto, user.id);
    return TenantMapper.toResponse(tenant);
  }

  @Put(':id')
  @RequirePermission('identity.tenant.update')
  @ResponseMessage('Tenant updated successfully')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @Actor() actor: ActorScope,
  ): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.update(id, dto, actor);
    return TenantMapper.toResponse(tenant);
  }
}
