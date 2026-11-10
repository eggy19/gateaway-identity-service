import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PermissionEntity } from './permission.entity';
import { RoleEntity } from './role.entity';

/** Role ↔ permission mapping. Unique per (role, permission) while not soft-deleted. */
@Entity('role_permission')
@Index('uq_role_permission_role_permission', ['roleId', 'permissionId'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class RolePermissionEntity extends BaseEntity {
  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => RoleEntity)
  @JoinColumn({ name: 'role_id' })
  role!: RoleEntity;

  @Index('idx_role_permission_permission_id')
  @Column({ name: 'permission_id', type: 'uuid' })
  permissionId!: string;

  @ManyToOne(() => PermissionEntity)
  @JoinColumn({ name: 'permission_id' })
  permission!: PermissionEntity;
}
