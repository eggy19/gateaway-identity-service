import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantEntity } from '../../tenant/entities/tenant.entity';
import { TenantService } from '../../tenant/services/tenant.service';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';
import { BranchEntity } from '../entities/branch.entity';
import { BranchStatus } from '../enums/branch-status.enum';
import { BranchRepository } from '../repositories/branch.repository';

const DEFAULT_BRANCH_CODE = 'MAIN';

@Injectable()
export class BranchService {
  constructor(
    private readonly branchRepository: BranchRepository,
    @Inject(forwardRef(() => TenantService))
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Create Branch flow (Business Flow §5): validate the tenant is active, reject
   * duplicate code within the tenant, then create the branch.
   */
  async create(dto: CreateBranchDto, actorId: string): Promise<BranchEntity> {
    await this.tenantService.findActiveByIdOrThrow(dto.tenantId);

    if (await this.branchRepository.existsByTenantAndCode(dto.tenantId, dto.code)) {
      throw new ConflictException(`Branch code "${dto.code}" already exists for this tenant`);
    }

    return this.branchRepository.save(
      this.branchRepository.create({
        tenantId: dto.tenantId,
        name: dto.name,
        code: dto.code,
        status: dto.status ?? BranchStatus.Active,
        createdBy: actorId,
        updatedBy: actorId,
      }),
    );
  }

  /**
   * Creates the tenant's initial branch as part of the Create Tenant transaction.
   * The tenant has just been created in the same transaction, so no validation
   * is needed here.
   */
  createDefaultBranch(
    tenant: TenantEntity,
    actorId: string,
    manager: EntityManager,
  ): Promise<BranchEntity> {
    return this.branchRepository.save(
      this.branchRepository.create({
        tenantId: tenant.id,
        name: `${tenant.name} - Main`,
        code: DEFAULT_BRANCH_CODE,
        status: BranchStatus.Active,
        createdBy: actorId,
        updatedBy: actorId,
      }),
      manager,
    );
  }

  async update(id: string, dto: UpdateBranchDto, actorId: string): Promise<BranchEntity> {
    const branch = await this.findByIdOrThrow(id);
    if (dto.name !== undefined) {
      branch.name = dto.name;
    }
    if (dto.status !== undefined) {
      branch.status = dto.status;
    }
    branch.updatedBy = actorId;
    return this.branchRepository.save(branch);
  }

  findAll(): Promise<BranchEntity[]> {
    return this.branchRepository.findAll();
  }

  findByTenant(tenantId: string): Promise<BranchEntity[]> {
    return this.branchRepository.findByTenant(tenantId);
  }

  /** Active-context resolver: soft-deleted branches are included (caller inspects `deletedAt`). */
  findByIdsWithDeleted(ids: string[]): Promise<BranchEntity[]> {
    return this.branchRepository.findByIdsWithDeleted(ids);
  }

  async findByIdOrThrow(id: string): Promise<BranchEntity> {
    const branch = await this.branchRepository.findById(id);
    if (!branch) {
      throw new NotFoundException(`Branch ${id} not found`);
    }
    return branch;
  }

  /** Validates that a branch exists and is active. */
  async findActiveByIdOrThrow(id: string): Promise<BranchEntity> {
    const branch = await this.findByIdOrThrow(id);
    if (branch.status !== BranchStatus.Active) {
      throw new BadRequestException(`Branch ${id} is not active`);
    }
    return branch;
  }
}
