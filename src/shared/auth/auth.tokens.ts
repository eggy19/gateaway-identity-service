/**
 * Dependency-injection tokens for the auth layer.
 *
 * Kept separate from `better-auth.ts` so consumers (guards, services, tests) can
 * reference the tokens without importing the ESM-only `better-auth` runtime.
 */

/** DI token used to inject the Better Auth instance across modules. */
export const AUTH_INSTANCE = 'AUTH_INSTANCE';

/** DI token for the pg connection pool dedicated to Better Auth. */
export const AUTH_DB_POOL = 'AUTH_DB_POOL';
