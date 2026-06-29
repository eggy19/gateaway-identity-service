import { validateEnv } from './env.validation';

const validBase = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'secret',
  DB_DATABASE: 'identity',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
};

describe('validateEnv', () => {
  it('throws when required variables are missing', () => {
    expect(() => validateEnv({})).toThrow(/Invalid environment configuration/);
  });

  it('throws when the auth secret is too short', () => {
    expect(() => validateEnv({ ...validBase, BETTER_AUTH_SECRET: 'short' })).toThrow();
  });

  it('coerces numeric and boolean values and applies defaults', () => {
    const config = validateEnv({ ...validBase, DB_SYNCHRONIZE: 'true' });

    expect(config.DB_PORT).toBe(5432);
    expect(config.DB_SYNCHRONIZE).toBe(true);
    expect(config.AUTH_MAX_FAILED_ATTEMPTS).toBe(5);
    expect(config.PASSWORD_MIN_LENGTH).toBe(8);
  });
});
