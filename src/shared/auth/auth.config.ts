import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { createAuth } from './better-auth';

/**
 * Standalone Better Auth instance for the Better Auth CLI (`@better-auth/cli`).
 *
 * This file is NOT imported by the Nest application — the runtime builds its
 * instance through dependency injection (see the auth module). It exists only so
 * the CLI can read the schema to generate/verify the Better Auth tables.
 */
loadEnv();

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: toInt(process.env.DB_PORT, 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'identity_service',
});

// Export a promise and a helper to obtain the runtime instance. The CLI can
// `await authPromise` or call `getAuth()` to get the resolved instance.
export const authPromise = createAuth({
  pool,
  secret: process.env.BETTER_AUTH_SECRET ?? 'cli-only-placeholder-secret-32-chars!!',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  minPasswordLength: toInt(process.env.PASSWORD_MIN_LENGTH, 8),
});

export const getAuth = async () => await authPromise;
