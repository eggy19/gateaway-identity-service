import { registerAs } from '@nestjs/config';

export interface GatewayConfig {
  readonly privateKeyPath: string;
  readonly jwtTtlSeconds: number;
  readonly services: Readonly<Record<string, string | undefined>>;
}

export interface AppConfig {
  readonly env: string;
  readonly port: number;
  readonly corsOrigins: string[];
}

export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly synchronize: boolean;
  readonly logging: boolean;
}

export interface AuthConfig {
  readonly secret: string;
  readonly baseUrl: string;
  readonly cookieSecure: boolean;
  readonly cookieDomain: string;
  readonly maxFailedAttempts: number;
  readonly lockDurationMinutes: number;
  readonly passwordMinLength: number;
}

const toBool = (value: string | undefined, fallback = false): boolean =>
  value === undefined ? fallback : ['true', '1', 'yes'].includes(value.toLowerCase());

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toList = (value: string | undefined, fallback: string[]): string[] => {
  const items = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return items.length > 0 ? items : fallback;
};

export const appConfig = registerAs(
  'app',
  (): AppConfig => ({
    env: process.env.NODE_ENV ?? 'development',
    port: toInt(process.env.PORT, 3000),
    corsOrigins: toList(process.env.CORS_ORIGIN, ['http://localhost:3000']),
  }),
);

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => ({
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'identity_service',
    synchronize: toBool(process.env.DB_SYNCHRONIZE, false),
    logging: toBool(process.env.DB_LOGGING, false),
  }),
);

export const authConfig = registerAs(
  'auth',
  (): AuthConfig => ({
    secret: process.env.BETTER_AUTH_SECRET ?? '',
    baseUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    cookieSecure: toBool(process.env.COOKIE_SECURE, false),
    cookieDomain: process.env.COOKIE_DOMAIN ?? 'localhost',
    maxFailedAttempts: toInt(process.env.AUTH_MAX_FAILED_ATTEMPTS, 5),
    lockDurationMinutes: toInt(process.env.AUTH_LOCK_DURATION_MINUTES, 15),
    passwordMinLength: toInt(process.env.PASSWORD_MIN_LENGTH, 8),
  }),
);

export const gatewayConfig = registerAs(
  'gateway',
  (): GatewayConfig => ({
    privateKeyPath: process.env.GATEWAY_PRIVATE_KEY_PATH ?? './certs/private.pem',
    jwtTtlSeconds: toInt(process.env.INTERNAL_JWT_TTL_SECONDS, 300),
    services: {
      inventory: process.env.INVENTORY_SERVICE_URL,
      billing: process.env.BILLING_SERVICE_URL,
      clinical: process.env.CLINICAL_SERVICE_URL,
      notification: process.env.NOTIFICATION_SERVICE_URL,
    },
  }),
);
