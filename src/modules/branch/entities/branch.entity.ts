import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { TenantEntity } from '../../tenant/entities/tenant.entity';
import { BranchStatus } from '../enums/branch-status.enum';

/**
 * A branch (cabang) belonging to a {@link TenantEntity}.
 * Users are assigned to branches via UserBranchEntity (User module).
 */
@Entity('branch')
@Unique('uq_branch_tenant_code', ['tenantId', 'code'])
export class BranchEntity extends BaseEntity {
  @Index('idx_branch_tenant_id')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.branches)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'code', type: 'varchar', length: 50 })
  code!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: BranchStatus.Active })
  status!: BranchStatus;
}
