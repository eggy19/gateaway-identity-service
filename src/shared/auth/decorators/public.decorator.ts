import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';

/**
 * Marks a route (or controller) as public, bypassing the global
 * {@link SessionGuard}. Use for endpoints such as login or health checks.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
