import { AuthOptionsParams, buildAuthOptions } from './auth-options';
import { dynamicImport } from '../utils/dynamic-import';

/**
 * Constructs a Better Auth instance from the given parameters.
 * Used by the Nest provider (runtime) and the CLI config (schema generation).
 */
/**
 * Constructs a Better Auth instance from the given parameters.
 * Uses dynamic import because `better-auth` is ESM-only.
 */
export async function createAuth(params: AuthOptionsParams) {
  const { betterAuth } = await dynamicImport('better-auth');
  const opts = await buildAuthOptions(params);
  return betterAuth(opts);
}

/** Concrete type of the configured Better Auth instance. */
export type AuthInstance = any;
