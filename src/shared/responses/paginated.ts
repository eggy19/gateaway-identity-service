export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

/**
 * Payload shape for paginated list endpoints. The ResponseInterceptor wraps it,
 * so the wire format is `{ success, message, data: { items, meta } }`.
 */
export interface PaginatedResult<T> {
  readonly items: T[];
  readonly meta: PaginationMeta;
}

export function buildPaginated<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  };
}
