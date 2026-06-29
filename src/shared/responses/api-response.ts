/**
 * Standard success envelope returned by every endpoint.
 * See coding standard section 15 (API Response Standard).
 */
export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly message: string;
  readonly data: T;
}

/**
 * Standard error envelope. Never includes stack traces or internal details.
 */
export interface ApiErrorResponse {
  readonly success: false;
  readonly message: string;
  readonly error: string;
  readonly timestamp: string;
  readonly path: string;
}

export const buildSuccess = <T>(data: T, message = 'Success'): ApiSuccessResponse<T> => ({
  success: true,
  message,
  data,
});
