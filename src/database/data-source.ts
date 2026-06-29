import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

loadEnv();

const toBool = (value: string | undefined, fallback = false): boolean =>
  value === undefined ? fallback : ['true', '1', 'yes'].includes(value.toLowerCase());

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/**
 * TypeORM options shared by the Nest runtime and the migration CLI.
 * `synchronize` stays disabled — schema changes go through migrations only.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: toInt(process.env.DB_PORT, 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'identity_service',
  synchronize: toBool(process.env.DB_SYNCHRONIZE, false),
  logging: toBool(process.env.DB_LOGGING, false),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
