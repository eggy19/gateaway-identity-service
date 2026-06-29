import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { LoginResult } from '../enums/login-result.enum';

/**
 * Append-only audit of every login attempt (DB-spec §5.9). Identifiers are
 * nullable because a failed attempt may not resolve to a known user/tenant.
 */
@Entity('login_history')
@Index('idx_login_history_user_created', ['userId', 'createdAt'])
export class LoginHistoryEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'login_result', type: 'varchar', length: 30 })
  loginResult!: LoginResult;

  @Column({ name: 'failure_reason', type: 'varchar', length: 255, nullable: true })
  failureReason!: string | null;
}
