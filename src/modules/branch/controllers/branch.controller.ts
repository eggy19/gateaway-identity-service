import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { ActorScope } from '../../../shared/auth/actor-scope';
import { Actor } from '../../../shared/auth/decorators/actor.decorator';
import { RequirePermission } from '../../../shared/auth/decorators/require-permission.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import { BranchCreationService } from '../../identity-admin/services/branch-creation.service';
import { BranchResponseDto } from '../dto/branch-response.dto';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';
import { BranchMapper } from '../mappers/branch.mapper';
import { BranchService } from '../services/branch.service';

@Controller('branches')
export class BranchController {
  constructor(
    private readonly branchService: BranchService,
    private readonly branchCreationService: BranchCreationService,
  ) {}

  @Get()
  @RequirePermission('identity.branch.read')
  async findAll(
    @Actor() actor: ActorScope,
    @Query('tenantId') tenantId?: string,
  ): Promise<BranchResponseDto[]> {
    const branches = await this.branchService.findAllInScope(actor, tenantId);
    return BranchMapper.toResponseList(branches);
  }

  @Get(':id')
  @RequirePermission('identity.branch.read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorScope,
  ): Promise<BranchResponseDto> {
    const branch = await this.branchService.findByIdInScopeOrThrow(id, actor);
    return BranchMapper.toResponse(branch);
  }

  @Post()
  @RequirePermission('identity.branch.create')
  @ResponseMessage('Branch created successfully')
  async create(
    @Body() dto: CreateBranchDto,
    @Actor() actor: ActorScope,
  ): Promise<BranchResponseDto> {
    const branch = await this.branchCreationService.create(dto, actor);
    return BranchMapper.toResponse(branch);
  }

  @Put(':id')
  @RequirePermission('identity.branch.update')
  @ResponseMessage('Branch updated successfully')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @Actor() actor: ActorScope,
  ): Promise<BranchResponseDto> {
    const branch = await this.branchService.update(id, dto, actor);
    return BranchMapper.toResponse(branch);
  }
}
