import { BranchEntity } from '../../branch/entities/branch.entity';
import { TenantEntity } from '../../tenant/entities/tenant.entity';
import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { UserBranchEntity } from '../entities/user-branch.entity';
import { UserSecurityEntity } from '../entities/user-security.entity';

/** A user joined with its security state and primary branch/tenant, for admin lists. */
export interface UserWithContext {
  readonly user: UserEntity;
  readonly security: UserSecurityEntity | null;
  readonly isLocked: boolean;
  readonly primaryBranch: BranchEntity | null;
  readonly tenant: TenantEntity | null;
}

export interface UserBranchWithContext {
  readonly assignment: UserBranchEntity;
  readonly branch: BranchEntity;
  readonly tenant: TenantEntity | null;
}

/** Full admin detail: user + security state + every branch assignment. */
export interface UserDetailContext {
  readonly user: UserEntity;
  readonly security: UserSecurityEntity | null;
  readonly isLocked: boolean;
  readonly branches: UserBranchWithContext[];
}
