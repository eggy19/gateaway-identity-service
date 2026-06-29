import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { BranchEntity } from '../../branch/entities/branch.entity';

/**
 * Many-to-many mapping between a Better Auth user and a {@link BranchEntity}.
 * `userId` references the Better Auth `user` table (UUID).
 */
@Entity('user_branch')
@Unique('uq_user_branch_user_branch', ['userId', 'branchId'])
export class UserBranchEntity extends BaseEntity {
  @Index('idx_user_branch_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index('idx_user_branch_branch_id')
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @ManyToOne(() => BranchEntity)
  @JoinColumn({ name: 'branch_id' })
  branch!: BranchEntity;

  /** Marks the user's primary/home branch. */
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;
}
