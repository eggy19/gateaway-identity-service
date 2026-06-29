/**
 * One-off helper: prints the exact DDL Better Auth expects for its tables,
 * using our real auth options (UUID ids + snake_case columns). The output is
 * transcribed into the TypeORM InitPhase1 migration so the whole schema lives
 * in a single migration pipeline.
 *
 * Run against an EMPTY database:
 *   npx ts-node -T scripts/generate-better-auth-sql.ts
 */
import { config as loadEnv } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { Pool } from 'pg';
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
import { getMigrations } from 'better-auth/db/migration';
import { buildAuthOptions } from '../src/shared/auth/auth-options';

loadEnv();

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

async function main(): Promise<void> {
  const pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'identity_service',
  });

  const options = buildAuthOptions({
    pool,
    secret: process.env.BETTER_AUTH_SECRET ?? 'cli-only-placeholder-secret-32-chars!!',
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    minPasswordLength: toInt(process.env.PASSWORD_MIN_LENGTH, 8),
  });

  const { compileMigrations } = await getMigrations(options);
  const sql = await compileMigrations();

  const outPath = 'scripts/better-auth.generated.sql';
  writeFileSync(outPath, sql, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`\n--- Better Auth DDL written to ${outPath} ---\n`);
  // eslint-disable-next-line no-console
  console.log(sql);

  await pool.end();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
