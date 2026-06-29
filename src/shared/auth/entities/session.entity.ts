import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Read-only TypeORM mapping of the Better Auth `session` table.
 *
 * Better Auth owns this table (sessions are created/revoked through the Better
 * Auth API). Columns use Better Auth's camelCase naming. Used for listing a
 * user's active sessions. Never use it to write/alter schema.
 */
@Entity('session')
export class SessionEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'expiresAt', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'token', type: 'text' })
  token!: string;

  @Column({ name: 'ipAddress', type: 'text', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'userAgent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'userId', type: 'uuid' })
  userId!: string;

  @Column({ name: 'createdAt', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt!: Date;
}
