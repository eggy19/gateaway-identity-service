export class UserRoleResponseDto {
  id!: string;
  roleId!: string;
  roleCode!: string;
  roleName!: string;
  /** `null` for a PLATFORM role. */
  tenantId!: string | null;
  branchId!: string | null;
  branchName!: string | null;
  assignedAt!: Date;
  assignedBy!: string | null;
  revokedAt!: Date | null;
  revokedBy!: string | null;
}

export class RevokeUserRoleResponseDto {
  revoked!: true;
}
