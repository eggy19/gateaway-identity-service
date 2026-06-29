import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../../../shared/auth/decorators/current-user.decorator';
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
  async findAll(): Promise<TenantResponseDto[]> {
    const tenants = await this.tenantService.findAll();
    return TenantMapper.toResponseList(tenants);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.findByIdOrThrow(id);
    return TenantMapper.toResponse(tenant);
  }

  @Post()
  @ResponseMessage('Tenant created successfully')
  async create(
    @Body() dto: CreateTenantDto,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.create(dto, user.id);
    return TenantMapper.toResponse(tenant);
  }

  @Put(':id')
  @ResponseMessage('Tenant updated successfully')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.update(id, dto, user.id);
    return TenantMapper.toResponse(tenant);
  }
}
