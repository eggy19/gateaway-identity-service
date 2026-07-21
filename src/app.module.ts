import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { appConfig, authConfig, databaseConfig, gatewayConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { BranchModule } from './modules/branch/branch.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { HealthModule } from './modules/health/health.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';
import { AuthCoreModule } from './shared/auth/auth-core.module';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { InternalJwtModule } from './shared/internal-jwt/internal-jwt.module';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { RequestLoggerMiddleware } from './shared/middleware/request-logger.middleware';
// `jose` is ESM-only; load dynamically when needed to avoid runtime require() errors.
import { dynamicImport } from './shared/utils/dynamic-import';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, authConfig, gatewayConfig],
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthCoreModule,
    InternalJwtModule,
    HealthModule,
    TenantModule,
    BranchModule,
    UserModule,
    AuthModule,
    GatewayModule, // must be last — wildcard routes must not shadow specific routes
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
export class InternalJwtService {
  private publicKey: string;

  constructor(publicKey: string) {
    this.publicKey = publicKey;
  }

  async verifyToken(token: string) {
    const { importSPKI, jwtVerify } = await dynamicImport('jose');
    const key = await importSPKI(this.publicKey, 'RS256');
    const { payload } = await jwtVerify(token, key);
    return payload;
  }
}
