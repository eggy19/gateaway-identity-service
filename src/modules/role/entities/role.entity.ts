import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { RoleScope } from '../enums/role-scope.enum';
import { RoleStatus } from '../enums/role-status.enum';

/**
 * A role. This phase only has system roles (`tenantId` NULL, `isSystem` true),
 * seeded by migration (BR-D1A-04). `tenantId` is reserved for per-tenant custom roles.
 *
 * The partial unique index `uq_role_tenant_code`
 * (`COALESCE(tenant_id, nil-uuid), code WHERE deleted_at IS NULL`) uses an
 * expression TypeORM cannot declare in decorators, so it lives in the migration only.
 */
@Entity('role')
export class RoleEntity extends BaseEntity {
  @Index('idx_role_tenant_id')
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'code', type: 'varchar', length: 50 })
  code!: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'scope', type: 'varchar', length: 20 })
  scope!: RoleScope;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @Column({ name: 'status', type: 'varchar', length: 20, default: RoleStatus.Active })
  status!: RoleStatus;
}
