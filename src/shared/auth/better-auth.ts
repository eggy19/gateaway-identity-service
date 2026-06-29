import { betterAuth } from 'better-auth';
import { AuthOptionsParams, buildAuthOptions } from './auth-options';

/**
 * Constructs a Better Auth instance from the given parameters.
 * Used by the Nest provider (runtime) and the CLI config (schema generation).
 */
export function createAuth(params: AuthOptionsParams): ReturnType<typeof betterAuth> {
  return betterAuth(buildAuthOptions(params));
}

/** Concrete type of the configured Better Auth instance. */
export type AuthInstance = ReturnType<typeof createAuth>;
