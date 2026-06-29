import type { IncomingHttpHeaders } from 'node:http';

/**
 * Converts Node/Express incoming headers into a web `Headers` object, the shape
 * Better Auth's server API (`auth.api.*`) expects for reading the session cookie.
 */
export function toWebHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
    } else if (value !== undefined) {
      result.set(key, value);
    }
  }
  return result;
}
