import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiError, ErrorCode } from '@slotbook/shared';
import { Response } from 'express';

/** Gives every error the same JSON shape: { statusCode, code, message, details? } (SRS 4.2). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toApiError(exception);
    if (body.statusCode >= 500) this.logger.error(exception);
    res.status(body.statusCode).json(body);
  }

  toApiError(exception: unknown): ApiError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null && 'code' in response) {
        return response as ApiError;
      }
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        // NFR-4. The throttler has already set a Retry-After header.
        return { statusCode: status, code: ErrorCode.RATE_LIMITED, message: 'Too many requests. Please wait a minute and try again.' };
      }
      return { statusCode: status, code: codeForStatus(status), message: exception.message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // A unique index caught a race that the service's own checks let through (FR-4).
      if (exception.code === 'P2002') {
        return { statusCode: 409, code: ErrorCode.SLOT_ALREADY_BOOKED, message: 'This slot has just been booked' };
      }
      if (exception.code === 'P2025') {
        return { statusCode: 404, code: ErrorCode.NOT_FOUND, message: 'Not found' };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong',
    };
  }
}

function codeForStatus(status: number): ErrorCode {
  if (status === 401) return ErrorCode.UNAUTHORIZED;
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status >= 500) return ErrorCode.INTERNAL_ERROR;
  return ErrorCode.VALIDATION_ERROR;
}
