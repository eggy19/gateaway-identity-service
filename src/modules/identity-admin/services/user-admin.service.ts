import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ActorScope, FORBIDDEN_MESSAGE } from '../../../shared/auth/actor-scope';
import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { UserRoleRepository } from '../../role/repositories/user-role.repository';
import { TenantService } from '../../tenant/services/tenant.service';
import { UpdateUserStatusDto } from '../../user/dto/update-user-status.dto';
import { UserStatus } from '../../user/enums/user-status.enum';
import { UserDetailContext } from '../../user/interfaces/user-context.interface';
import { UserSecurityService } from '../../user/services/user-security.service';
import { UserService } from '../../user/services/user.service';

/** Roles whose holders only an OWNER (or the platform) may deactivate/unlock (KP-33, BR-D1D-02). */
const PROTECTED_ROLES = ['OWNER', 'ADMIN', 'SUPER_ADMIN'];
const OWNER_ROLE = 'OWNER';
const PLATFORM_ROLE = 'SUPER_ADMIN';

/**
 * Status / unlock flows that need both user data and RBAC data (KP-33, BR-D1C-06,
 * BR-D1D-03). Lives outside `UserModule` because `RoleModule` already depends on it.
 * Check order: scope 404 -> self 422 -> hierarchy 403 -> last OWNER 409.
 */
@Injectable()
export class UserAdminService {
  constructor(
    private readonly userService: UserService,
    private readonly userSecurityService: UserSecurityService,
    private readonly userRoleRepository: UserRoleRepository,
    private readonly tenantService: TenantService,
    private readonly dataSource: DataSource,
  ) {}

  async updateStatus(id: string, dto: UpdateUserStatusDto, actor: ActorScope): Promise<UserEntity> {
    await this.userService.findByIdInScopeOrThrow(id, actor);

    if (dto.status === UserStatus.Inactive && id === actor.userId) {
      throw new UnprocessableEntityException('Anda tidak dapat menonaktifkan akun sendiri');
    }
    await this.assertCanManageTarget(id, actor);

    if (dto.status !== UserStatus.Inactive) {
      return this.userService.updateStatus(id, dto);
    }

    // Serialised per tenant (BR-D1D-03): the tenant row lock makes two concurrent
    // deactivations of the last two OWNERs fail for the second one. The target is re-read
    // on the transaction connection AFTER the lock, so "already inactive" and the OWNER
    // count are judged on the state the first transaction committed.
    await this.dataSource.transaction(async (manager) => {
      const tenantIds = await this.userRoleRepository.findOwnerTenantIds(id, manager);
      await this.tenantService.lockByIds(tenantIds, manager);
      const current = await this.userService.findByIdOrThrow(id, manager);
      if (current.status === UserStatus.Inactive) return;

      await this.assertNotLastActiveOwner(tenantIds, id, manager);
      await this.userService.updateStatus(id, dto, manager);
    });
    return this.userService.findByIdOrThrow(id);
  }

  async unlock(id: string, actor: ActorScope): Promise<UserDetailContext> {
    await this.userService.findByIdInScopeOrThrow(id, actor);
    await this.assertCanManageTarget(id, actor);
    await this.userSecurityService.unlock(id, actor.userId);
    return this.userService.findDetail(id, actor);
  }

  /**
   * KP-33 (option b): only OWNER / platform may change status of a user holding OWNER/ADMIN.
   * A SUPER_ADMIN target is reserved for the platform: even an OWNER gets 403 (BR-D1D-02).
   */
  private async assertCanManageTarget(targetId: string, actor: ActorScope): Promise<void> {
    if (actor.isPlatform || targetId === actor.userId) {
      return;
    }
    const held = await this.userRoleRepository.findHeldRoleCodes(targetId, PROTECTED_ROLES);
    if (held.includes(PLATFORM_ROLE)) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
    if (actor.roles.includes(OWNER_ROLE)) {
      return;
    }
    if (held.length > 0) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
  }

  /** "Active OWNER" = user with status `active` holding a live OWNER assignment (KP-32). */
  private async assertNotLastActiveOwner(
    tenantIds: string[],
    targetId: string,
    manager: EntityManager,
  ): Promise<void> {
    for (const tenantId of tenantIds) {
      const others = await this.userRoleRepository.countOtherActiveOwners(
        tenantId,
        targetId,
        manager,
      );
      if (others === 0) {
        throw new ConflictException('Tenant harus memiliki minimal satu OWNER aktif');
      }
    }
  }
}
