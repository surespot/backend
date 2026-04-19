import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as public - no JWT authentication required.
 */
export const Public = () => SetMetadata('isPublic', true);

/** Metadata key for {@link PublicInDevelopment}. */
export const IS_PUBLIC_IN_DEVELOPMENT_KEY = 'isPublicInDevelopment';

/**
 * Skips JWT and role checks when NODE_ENV is `development` only.
 * Production remains protected by the same guards as sibling routes.
 */
export const PublicInDevelopment = () =>
  SetMetadata(IS_PUBLIC_IN_DEVELOPMENT_KEY, true);
