import { LoginResult } from '../enums/login-result.enum';

/**
 * Login-history row enriched with user/tenant/branch names. Name fields are
 * nullable — a failed attempt may not resolve to a known user or tenant.
 */
export class LoginHistoryResponseDto {
  id!: string;
  userId!: string | null;
  userName!: string | null;
  userEmail!: string | null;
  tenantId!: string | null;
  tenantName!: string | null;
  branchId!: string | null;
  branchName!: string | null;
  ipAddress!: string | null;
  userAgent!: string | null;
  loginResult!: LoginResult;
  failureReason!: string | null;
  createdAt!: Date;
}
