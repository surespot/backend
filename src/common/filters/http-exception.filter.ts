import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // App code throws HttpExceptions with our { success, error } shape — pass through as-is
      if (typeof body === 'object' && body !== null && 'error' in body) {
        response.status(status).json(body);
        return;
      }

      // NestJS built-in exceptions (e.g. ValidationPipe, guards) — normalise to our shape
      const message =
        typeof body === 'string'
          ? body
          : (body as Record<string, unknown>).message ?? exception.message;

      response.status(status).json({
        success: false,
        error: {
          code: this.statusToCode(status),
          message: Array.isArray(message) ? message.join('; ') : message,
        },
      });
      return;
    }

    // Truly unexpected error — log and return a generic 500
    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
    };
    return map[status] ?? `HTTP_${status}`;
  }
}
