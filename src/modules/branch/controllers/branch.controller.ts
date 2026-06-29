import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../../shared/auth/decorators/current-user.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import type { SessionUser } from '../../../shared/auth/auth.types';
import { BranchResponseDto } from '../dto/branch-response.dto';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';
import { BranchMapper } from '../mappers/branch.mapper';
import { BranchService } from '../services/branch.service';

@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get()
  async findAll(@Query('tenantId') tenantId?: string): Promise<BranchResponseDto[]> {
    const branches = tenantId
      ? await this.branchService.findByTenant(tenantId)
      : await this.branchService.findAll();
    return BranchMapper.toResponseList(branches);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<BranchResponseDto> {
    const branch = await this.branchService.findByIdOrThrow(id);
    return BranchMapper.toResponse(branch);
  }

  @Post()
  @ResponseMessage('Branch created successfully')
  async create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: SessionUser,
  ): Promise<BranchResponseDto> {
    const branch = await this.branchService.create(dto, user.id);
    return BranchMapper.toResponse(branch);
  }

  @Put(':id')
  @ResponseMessage('Branch updated successfully')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: SessionUser,
  ): Promise<BranchResponseDto> {
    const branch = await this.branchService.update(id, dto, user.id);
    return BranchMapper.toResponse(branch);
  }
}
