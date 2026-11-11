import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { RoleEntity } from './role.entity';

/**
 * Role assignment of a user, per branch (BR-D1A-05..09).
 * - Role scope BRANCH: `tenantId` and `branchId` required.
 * - Role scope PLATFORM: both NULL (DB CHECK `(tenant_id IS NULL) = (branch_id IS NULL)`;
 *   scope vs. columns is validated in the service layer).
 * - Rows are never updated: revoke = soft delete, re-assign = new row.
 *
 * The partial unique index `uq_user_role_user_role_branch`
 * (`user_id, role_id, COALESCE(branch_id, nil-uuid) WHERE deleted_at IS NULL`)
 * and the CHECK constraint exist in the migration only, as do the composite FK
 * `fk_user_role_branch_tenant (branch_id, tenant_id) -> branch(id, tenant_id)` and the
 * `fk_user_role_user` ON DELETE RESTRICT (T-16a).
 */
@Entity('user_role')
@Index('idx_user_role_user_branch', ['userId', 'branchId'])
@Index('idx_user_role_role_tenant', ['roleId', 'tenantId'], { where: '"deleted_at" IS NULL' })
export class UserRoleEntity extends BaseEntity {
  /** References the Better Auth `user` table (UUID). */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => RoleEntity)
  @JoinColumn({ name: 'role_id' })
  role!: RoleEntity;

  @Index('idx_user_role_tenant_id')
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;
}
