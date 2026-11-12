import { ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ActorScope, canAccessTenant, FORBIDDEN_MESSAGE } from '../../../shared/auth/actor-scope';
import { CreateBranchDto } from '../../branch/dto/create-branch.dto';
import { BranchEntity } from '../../branch/entities/branch.entity';
import { BranchService } from '../../branch/services/branch.service';
import { UserRoleRepository } from '../../role/repositories/user-role.repository';
import { UserBranchRepository } from '../../user/repositories/user-branch.repository';

const OWNER_ROLE = 'OWNER';

/**
 * `POST /branches` (KP-22 / BR-D1D-10): when an OWNER of the tenant creates a branch, the
 * creator receives a non-primary `user_branch` and an `OWNER` `user_role` for it in the same
 * transaction. This is a systemic exception to BR-D1D-08. Lives outside `BranchModule`
 * because `RoleModule` already depends on it.
 */
@Injectable()
export class BranchCreationService {
  constructor(
    private readonly branchService: BranchService,
    private readonly userBranchRepository: UserBranchRepository,
    private readonly userRoleRepository: UserRoleRepository,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateBranchDto, actor: ActorScope): Promise<BranchEntity> {
    // Tenant scope: a non-platform actor may only create branches in their own tenant.
    if (!canAccessTenant(actor, dto.tenantId)) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
    // OWNER held in the actor's active tenant; a platform actor creating a branch in a
    // different tenant does not become OWNER there.
    const grantOwner = actor.roles.includes(OWNER_ROLE) && actor.tenantId === dto.tenantId;

    return this.dataSource.transaction(async (manager) => {
      const branch = await this.branchService.create(dto, actor.userId, manager);
      if (grantOwner) {
        await this.grantOwner(branch, actor.userId, manager);
      }
      return branch;
    });
  }

  private async grantOwner(
    branch: BranchEntity,
    userId: string,
    manager: EntityManager,
  ): Promise<void> {
    const ownerRoleId = await this.userRoleRepository.findSystemRoleId(OWNER_ROLE, manager);
    if (!ownerRoleId) {
      throw new InternalServerErrorException('System role OWNER is not configured');
    }
    await this.userBranchRepository.save(
      this.userBranchRepository.create({
        userId,
        branchId: branch.id,
        isPrimary: false,
        createdBy: userId,
        updatedBy: userId,
      }),
      manager,
    );
    await this.userRoleRepository.save(
      this.userRoleRepository.create({
        userId,
        roleId: ownerRoleId,
        tenantId: branch.tenantId,
        branchId: branch.id,
        createdBy: userId,
        updatedBy: userId,
      }),
      manager,
    );
  }
}
