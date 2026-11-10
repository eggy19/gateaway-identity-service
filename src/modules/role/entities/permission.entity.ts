import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Global permission catalog (platform-owned reference data, no tenant/branch).
 * `code` follows `<service>.<resource>.<action>` (BR-D1A-01). Rows are only
 * changed through migrations (BR-D1A-02).
 */
@Entity('permission')
@Index('uq_permission_code', ['code'], { unique: true, where: '"deleted_at" IS NULL' })
export class PermissionEntity extends BaseEntity {
  @Column({ name: 'code', type: 'varchar', length: 100 })
  code!: string;

  @Index('idx_permission_service')
  @Column({ name: 'service', type: 'varchar', length: 30 })
  service!: string;

  @Column({ name: 'resource', type: 'varchar', length: 50 })
  resource!: string;

  @Column({ name: 'action', type: 'varchar', length: 30 })
  action!: string;

  @Column({ name: 'description', type: 'varchar', length: 255 })
  description!: string;

  /** `true` = may only be held by roles with scope PLATFORM. */
  @Column({ name: 'is_platform', type: 'boolean', default: false })
  isPlatform!: boolean;
}
