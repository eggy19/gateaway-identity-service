import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message';

/**
 * Overrides the default success message in the response envelope.
 *
 * @example
 * \@ResponseMessage('User created successfully')
 * \@Post()
 * create() { ... }
 */
export const ResponseMessage = (message: string): MethodDecorator =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
