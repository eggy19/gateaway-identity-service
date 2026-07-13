import { UserStatus } from '../enums/user-status.enum';

export class UserSecurityInfoDto {
  failedLoginCount!: number;
  blockUntil!: Date | null;
  lockReason!: string | null;
  isLocked!: boolean;
  lastLoginAt!: Date | null;
  lastLoginIp!: string | null;
  lastLoginDevice!: string | null;
  forceChangePassword!: boolean;
}

export class UserBranchInfoDto {
  branchId!: string;
  branchName!: string;
  branchCode!: string;
  tenantId!: string | null;
  tenantName!: string | null;
  isPrimary!: boolean;
}

/** Admin detail: user + security state + branch assignments. */
export class UserDetailResponseDto {
  id!: string;
  name!: string;
  email!: string;
  emailVerified!: boolean;
  status!: UserStatus;
  security!: UserSecurityInfoDto | null;
  branches!: UserBranchInfoDto[];
  createdAt!: Date;
  updatedAt!: Date;
}
