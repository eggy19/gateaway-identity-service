import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Assigns a correlation id to every request (honouring an inbound
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
    const requestId = (Array.isArray(inbound) ? inbound[0] : inbound) ?? randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms [${requestId}]`,
      );
    });

    next();
  }
}
