import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Strongly-typed, validated environment configuration.
 * The application refuses to boot if required variables are missing or invalid.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  readonly NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(0)
  @Max(65535)
  readonly PORT: number = 3000;

  @IsString()
  readonly DB_HOST!: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  readonly DB_PORT!: number;

  @IsString()
  readonly DB_USERNAME!: string;

  @IsString()
  readonly DB_PASSWORD!: string;

  @IsString()
  readonly DB_DATABASE!: string;

  @IsBoolean()
  @IsOptional()
  readonly DB_SYNCHRONIZE: boolean = false;

  @IsBoolean()
  @IsOptional()
  readonly DB_LOGGING: boolean = false;

  @IsString()
  @MinLength(32)
  readonly BETTER_AUTH_SECRET!: string;

  @IsString()
  readonly BETTER_AUTH_URL!: string;

  @IsBoolean()
  @IsOptional()
  readonly COOKIE_SECURE: boolean = false;

  @IsString()
  @IsOptional()
  readonly COOKIE_DOMAIN: string = 'localhost';

  @IsString()
  @IsOptional()
  readonly CORS_ORIGIN: string = 'http://localhost:3000';

  @IsInt()
  @Min(1)
  @IsOptional()
  readonly AUTH_MAX_FAILED_ATTEMPTS: number = 5;

  @IsInt()
  @Min(1)
  @IsOptional()
  readonly AUTH_LOCK_DURATION_MINUTES: number = 15;

  @IsInt()
  @Min(8)
  @IsOptional()
  readonly PASSWORD_MIN_LENGTH: number = 8;
}

const TRUTHY = new Set(['true', '1', 'yes']);

function coerce(config: Record<string, unknown>): Record<string, unknown> {
  const booleanKeys = ['DB_SYNCHRONIZE', 'DB_LOGGING', 'COOKIE_SECURE'];
  const numberKeys = [
    'PORT',
    'DB_PORT',
    'AUTH_MAX_FAILED_ATTEMPTS',
    'AUTH_LOCK_DURATION_MINUTES',
    'PASSWORD_MIN_LENGTH',
  ];
  const result: Record<string, unknown> = { ...config };

  for (const key of booleanKeys) {
    const value = result[key];
    if (typeof value === 'string') {
      result[key] = TRUTHY.has(value.toLowerCase());
    }
  }
  for (const key of numberKeys) {
    const value = result[key];
    if (typeof value === 'string') {
      result[key] = Number.parseInt(value, 10);
    }
  }
  return result;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, coerce(config), {
    enableImplicitConversion: false,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return validated;
}
