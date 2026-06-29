import { Global, Inject, Module, OnModuleDestroy, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Pool } from 'pg';
import { AuthConfig, DatabaseConfig } from '../../config/configuration';
import { createAuth } from './better-auth';
import { AUTH_DB_POOL, AUTH_INSTANCE } from './auth.tokens';
import { SessionGuard } from './guards/session.guard';

const poolProvider: Provider = {
  provide: AUTH_DB_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Pool => {
    const db = config.getOrThrow<DatabaseConfig>('database');
    return new Pool({
      host: db.host,
      port: db.port,
      user: db.username,
      password: db.password,
      database: db.database,
    });
  },
};

const authProvider: Provider = {
  provide: AUTH_INSTANCE,
  inject: [ConfigService, AUTH_DB_POOL],
  useFactory: (config: ConfigService, pool: Pool) => {
    const auth = config.getOrThrow<AuthConfig>('auth');
    return createAuth({
      pool,
      secret: auth.secret,
      baseURL: auth.baseUrl,
      minPasswordLength: auth.passwordMinLength,
    });
  },
};

/**
 * Provides the shared Better Auth instance (and its dedicated pg pool) and
 * registers the global {@link SessionGuard}. Global so any module can inject
 * {@link AUTH_INSTANCE} without re-importing.
 */
@Global()
@Module({
  providers: [poolProvider, authProvider, { provide: APP_GUARD, useClass: SessionGuard }],
  exports: [AUTH_INSTANCE],
})
export class AuthCoreModule implements OnModuleDestroy {
  constructor(@Inject(AUTH_DB_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
