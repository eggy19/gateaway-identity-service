import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Assigns a correlation id to every request (honouring an inbound UUID
 * `X-Request-Id`), echoes it back on the response, and logs a single line per
 * request on completion.
 *
 * Only method, path, status and duration are logged — never headers, cookies,
 * or bodies — so credentials and tokens are never written to logs
 * (CLAUDE-STANDART §11).
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const inbound = req.headers['x-request-id'];
    const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
    const requestId = candidate && UUID_REGEX.test(candidate) ? candidate : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `${req.method} ${req.originalUrl.split(/[?#]/, 1)[0]} ${res.statusCode} ${durationMs}ms [${requestId}]`,
      );
    });

    next();
  }
}
