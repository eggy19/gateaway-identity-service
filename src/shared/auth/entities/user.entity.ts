import { Column, Entity, PrimaryColumn } from 'typeorm';
import { UserStatus } from '../../../modules/user/enums/user-status.enum';

/**
 * Read-only TypeORM mapping of the Better Auth `user` table.
 *
 * Better Auth owns this table (writes go through the Better Auth API). Columns
 * use Better Auth's camelCase naming. This entity exists so our modules can read
 * user data through the repository pattern. Never use it to write/alter schema.
 */
@Entity('user')
export class UserEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'name', type: 'text' })
  name!: string;

  @Column({ name: 'email', type: 'text' })
  email!: string;

  @Column({ name: 'emailVerified', type: 'boolean' })
  emailVerified!: boolean;

  @Column({ name: 'image', type: 'text', nullable: true })
  image!: string | null;

  @Column({ name: 'status', type: 'text', nullable: true })
  status!: UserStatus | null;

  @Column({ name: 'createdAt', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt!: Date;
}
