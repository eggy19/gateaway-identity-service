import { Injectable, NotFoundException } from '@nestjs/common';
import { ActorScope } from '../../../shared/auth/actor-scope';
import { PermissionEntity } from '../entities/permission.entity';
import { RoleEntity } from '../entities/role.entity';
import { RoleRepository, RoleVisibility } from '../repositories/role.repository';

/** Visibility of roles for an actor (BR-D1D-11): non-platform actors never see PLATFORM roles. */
export function roleVisibility(actor: ActorScope): RoleVisibility {
  return actor.isPlatform ? { platform: true } : { platform: false, tenantId: actor.tenantId };
}

/** Read side of the role catalog (§8.4). Roles and permissions are never written through the API. */
@Injectable()
export class RoleService {
  constructor(private readonly roleRepository: RoleRepository) {}

  findAll(actor: ActorScope): Promise<RoleEntity[]> {
    return this.roleRepository.findVisible(roleVisibility(actor));
  }

  /** Invisible roles are reported as missing (404), never 403 (BR-D1C-05). */
  async findByIdOrThrow(id: string, actor: ActorScope): Promise<RoleEntity> {
    const role = await this.roleRepository.findVisibleById(id, roleVisibility(actor));
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    return role;
  }

  async findDetail(
    id: string,
    actor: ActorScope,
  ): Promise<{ role: RoleEntity; permissions: PermissionEntity[] }> {
    const role = await this.findByIdOrThrow(id, actor);
    const permissions = await this.roleRepository.findPermissionsOfRole(role.id);
    return { role, permissions };
  }

  findAllPermissions(actor: ActorScope): Promise<PermissionEntity[]> {
    return this.roleRepository.findAllPermissions(actor.isPlatform);
  }
}
