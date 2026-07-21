import * as argon2 from 'argon2';
import type { BetterAuthOptions } from 'better-auth';
import type { Pool } from 'pg';

export interface AuthOptionsParams {
  readonly pool: Pool;
  readonly secret: string;
  readonly baseURL: string;
  readonly basePath?: string;
  readonly minPasswordLength?: number;
  readonly sessionExpiresInSeconds?: number;
}

const DEFAULT_BASE_PATH = '/api/v1/auth';
const DEFAULT_MIN_PASSWORD_LENGTH = 8;
const DEFAULT_SESSION_EXPIRES_IN = 60 * 60 * 24 * 7; // 7 days
const SESSION_UPDATE_AGE = 60 * 60 * 24; // refresh once per day

/**
 * Builds the Better Auth configuration shared by the Nest runtime and the
 * Better Auth CLI (schema generation).
 *
 * Key project-standard alignments:
 * - `generateId: 'uuid'` → Better Auth tables use UUID primary keys (DB-spec §7).
 * - `casing: 'snake'` → Better Auth columns are snake_case like the custom tables.
 * - Argon2id password hashing replaces the default scrypt (CLAUDE-STANDART §16).
 */
import { dynamicImport } from '../utils/dynamic-import';

export async function buildAuthOptions(params: AuthOptionsParams): Promise<BetterAuthOptions> {
  const {
    pool,
    secret,
    baseURL,
    basePath = DEFAULT_BASE_PATH,
    minPasswordLength = DEFAULT_MIN_PASSWORD_LENGTH,
    sessionExpiresInSeconds = DEFAULT_SESSION_EXPIRES_IN,
  } = params;

  const { PostgresDialect } = await dynamicImport('kysely');

  return {
    appName: 'gateway-identity-service',
    secret,
    baseURL,
    basePath,
    database: {
      dialect: new PostgresDialect({ pool }),
      type: 'postgres',
      casing: 'snake',
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength,
      password: {
        hash: (password: string): Promise<string> =>
          argon2.hash(password, { type: argon2.argon2id }),
        verify: ({ hash, password }: { hash: string; password: string }): Promise<boolean> =>
          argon2.verify(hash, password),
      },
    },
    user: {
      additionalFields: {
        // Account activation flag used by the authorization checks (Business Flow).
        status: {
          type: 'string',
          required: false,
          input: false,
          defaultValue: 'active',
          index: true,
        },
      },
    },
    advanced: {
      database: {
        generateId: 'uuid',
      },
    },
    session: {
      expiresIn: sessionExpiresInSeconds,
      updateAge: SESSION_UPDATE_AGE,
    },
  };
}
