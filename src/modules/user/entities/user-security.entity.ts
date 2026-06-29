import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Security state for a Better Auth user, kept separate from the identity table
 * (DB-spec §5.8). `userId` references the Better Auth `user` table (UUID).
 */
@Entity('user_security')
export class UserSecurityEntity extends BaseEntity {
  @Index('uq_user_security_user_id', { unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'failed_login_count', type: 'int', default: 0 })
  failedLoginCount!: number;

  @Column({ name: 'last_failed_login_at', type: 'timestamptz', nullable: true })
  lastFailedLoginAt!: Date | null;

  @Index('idx_user_security_block_until')
  @Column({ name: 'block_until', type: 'timestamptz', nullable: true })
  blockUntil!: Date | null;

  @Column({ name: 'lock_reason', type: 'varchar', length: 255, nullable: true })
  lockReason!: string | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'last_login_ip', type: 'varchar', length: 45, nullable: true })
  lastLoginIp!: string | null;

  @Column({ name: 'last_login_device', type: 'varchar', length: 255, nullable: true })
  lastLoginDevice!: string | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt!: Date | null;

  @Column({ name: 'force_change_password', type: 'boolean', default: false })
  forceChangePassword!: boolean;
}
