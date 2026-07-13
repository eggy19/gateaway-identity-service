import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { UserResponseDto } from '../dto/user-response.dto';
import { UserListItemResponseDto } from '../dto/user-list-item-response.dto';
import {
  UserBranchInfoDto,
  UserDetailResponseDto,
  UserSecurityInfoDto,
} from '../dto/user-detail-response.dto';
import { UserDetailContext, UserWithContext } from '../interfaces/user-context.interface';
import { UserStatus } from '../enums/user-status.enum';

export class UserMapper {
  static toResponse(entity: UserEntity, branchIds?: string[]): UserResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      emailVerified: entity.emailVerified,
      status: entity.status ?? UserStatus.Active,
      branchIds,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toResponseList(entities: UserEntity[]): UserResponseDto[] {
    return entities.map((entity) => UserMapper.toResponse(entity));
  }

  static toListItem(context: UserWithContext): UserListItemResponseDto {
    const { user, security, isLocked, primaryBranch, tenant } = context;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status ?? UserStatus.Active,
      tenantId: tenant?.id ?? null,
      tenantName: tenant?.name ?? null,
      primaryBranchId: primaryBranch?.id ?? null,
      primaryBranchName: primaryBranch?.name ?? null,
      isLocked,
      blockUntil: security?.blockUntil ?? null,
      lastLoginAt: security?.lastLoginAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static toListItemList(contexts: UserWithContext[]): UserListItemResponseDto[] {
    return contexts.map((context) => UserMapper.toListItem(context));
  }

  static toDetail(context: UserDetailContext): UserDetailResponseDto {
    const { user, security, isLocked, branches } = context;
    const securityInfo: UserSecurityInfoDto | null = security
      ? {
          failedLoginCount: security.failedLoginCount,
          blockUntil: security.blockUntil,
          lockReason: security.lockReason,
          isLocked,
          lastLoginAt: security.lastLoginAt,
          lastLoginIp: security.lastLoginIp,
          lastLoginDevice: security.lastLoginDevice,
          forceChangePassword: security.forceChangePassword,
        }
      : null;

    const branchInfos: UserBranchInfoDto[] = branches.map(({ assignment, branch, tenant }) => ({
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code,
      tenantId: tenant?.id ?? null,
      tenantName: tenant?.name ?? null,
      isPrimary: assignment.isPrimary,
    }));

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status ?? UserStatus.Active,
      security: securityInfo,
      branches: branchInfos,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
