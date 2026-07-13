import { Matches } from 'class-validator';

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loose UUID-format check matching Nest's ParseUUIDPipe. class-validator's
 * @IsUUID enforces RFC-4122 version/variant nibbles, which rejects the fixed
 * seed ids (e.g. cccccccc-0000-...); path params already accept those, so
 * query filters must too.
 */
export function IsUuidLike(): PropertyDecorator {
  return Matches(UUID_LIKE, { message: '$property must be a UUID' });
}
