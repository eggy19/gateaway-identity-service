import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BranchService } from '../../branch/services/branch.service';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantStatus } from '../enums/tenant-status.enum';
import { TenantRepository } from '../repositories/tenant.repository';

@Injectable()
export class TenantService {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => BranchService))
    private readonly branchService: BranchService,
  ) {}

  /**
   * Create Tenant flow (Business Flow §4): check duplicate code, create the
   * tenant, then create its default branch — all in a single transaction.
   */
  async create(dto: CreateTenantDto, actorId: string): Promise<TenantEntity> {
    return this.dataSource.transaction(async (manager) => {
      if (await this.tenantRepository.existsByCode(dto.code, manager)) {
        throw new ConflictException(`Tenant code "${dto.code}" already exists`);
      }

      const tenant = await this.tenantRepository.save(
        this.tenantRepository.create({
          name: dto.name,
          code: dto.code,
          status: dto.status ?? TenantStatus.Active,
          createdBy: actorId,
          updatedBy: actorId,
        }),
        manager,
      );

      await this.branchService.createDefaultBranch(tenant, actorId, manager);
      return tenant;
    });
  }

  async update(id: string, dto: UpdateTenantDto, actorId: string): Promise<TenantEntity> {
    const tenant = await this.findByIdOrThrow(id);
    if (dto.name !== undefined) {
      tenant.name = dto.name;
    }
    if (dto.status !== undefined) {
      tenant.status = dto.status;
    }
    tenant.updatedBy = actorId;
    return this.tenantRepository.save(tenant);
  }

  findAll(): Promise<TenantEntity[]> {
    return this.tenantRepository.findAll();
  }

  /** Active-context resolver: soft-deleted tenants are included (caller inspects `deletedAt`). */
  findByIdsWithDeleted(ids: string[]): Promise<TenantEntity[]> {
    return this.tenantRepository.findByIdsWithDeleted(ids);
  }

  async findByIdOrThrow(id: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  /** Validates that a tenant exists and is active (Business Flow §5). */
  async findActiveByIdOrThrow(id: string): Promise<TenantEntity> {
    const tenant = await this.findByIdOrThrow(id);
    if (tenant.status !== TenantStatus.Active) {
      throw new BadRequestException(`Tenant ${id} is not active`);
    }
    return tenant;
  }
}
