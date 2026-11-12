import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ActorScope, canAccessTenant } from '../../../shared/auth/actor-scope';
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

  async update(id: string, dto: UpdateTenantDto, actor: ActorScope): Promise<TenantEntity> {
    // Defence in depth: only the platform holds identity.tenant.update, but scope is checked anyway.
    const tenant = await this.findByIdInScopeOrThrow(id, actor);
    if (dto.name !== undefined) {
      tenant.name = dto.name;
    }
    if (dto.status !== undefined) {
      tenant.status = dto.status;
    }
    tenant.updatedBy = actor.userId;
    return this.tenantRepository.save(tenant);
  }

  findAll(): Promise<TenantEntity[]> {
    return this.tenantRepository.findAll();
  }

  /** Tenant scope (BR-D1C-02/03): the actor's own tenant, or every tenant for the platform. */
  async findAllInScope(actor: ActorScope): Promise<TenantEntity[]> {
    if (actor.isPlatform) {
      return this.tenantRepository.findAll();
    }
    if (!actor.tenantId) {
      return [];
    }
    const tenant = await this.tenantRepository.findById(actor.tenantId);
    return tenant ? [tenant] : [];
  }

  /** Out-of-scope tenants are reported as missing (404), never 403 (BR-D1C-05). */
  async findByIdInScopeOrThrow(id: string, actor: ActorScope): Promise<TenantEntity> {
    if (!canAccessTenant(actor, id)) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return this.findByIdOrThrow(id);
  }

  /**
   * Row-locks the tenants (ids sorted, so concurrent callers lock in the same order) inside
   * the caller's transaction. Serialises the "last active OWNER" check (BR-D1D-03).
   */
  lockByIds(ids: string[], manager: EntityManager): Promise<void> {
    return this.tenantRepository.lockByIds([...ids].sort(), manager);
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
