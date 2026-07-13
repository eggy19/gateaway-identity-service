import { UserStatus } from '../enums/user-status.enum';

/** Admin list item: user enriched with tenant/branch names and lock state. */
export class UserListItemResponseDto {
  id!: string;
  name!: string;
  email!: string;
  emailVerified!: boolean;
  status!: UserStatus;
  tenantId!: string | null;
  tenantName!: string | null;
  primaryBranchId!: string | null;
  primaryBranchName!: string | null;
  isLocked!: boolean;
  blockUntil!: Date | null;
  lastLoginAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
