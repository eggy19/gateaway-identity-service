import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../responses/api-response';

/**
 * Global exception filter producing the standard error envelope.
 *
 * - Known {@link HttpException}s surface their status and message.
 * - Everything else is logged and reported as a generic 500 so that
 *   internal details and stack traces are never leaked to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /** Statuses at or above this threshold are treated as server faults and logged. */
  private static readonly SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.resolve(exception);

    if (status >= AllExceptionsFilter.SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    message: string;
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : this.extractMessage(payload as Record<string, unknown>);
      return { status, message, error: exception.name };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'InternalServerError',
    };
  }

  private extractMessage(payload: Record<string, unknown>): string {
    const raw = payload['message'];
    if (Array.isArray(raw)) {
      return raw.join(', ');
    }
    return typeof raw === 'string' ? raw : 'Unexpected error';
  }
}
