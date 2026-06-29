import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { BranchEntity } from '../../branch/entities/branch.entity';
import { TenantStatus } from '../enums/tenant-status.enum';

/**
 * Organisation / company that uses the platform (e.g. a clinic group).
 * Owns one or more {@link BranchEntity}.
 */
@Entity('tenant')
export class TenantEntity extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 150 })
  name!: string;

  @Index('uq_tenant_code', { unique: true })
  @Column({ name: 'code', type: 'varchar', length: 50 })
  code!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: TenantStatus.Active })
  status!: TenantStatus;

  @OneToMany(() => BranchEntity, (branch) => branch.tenant)
  branches!: BranchEntity[];
}
