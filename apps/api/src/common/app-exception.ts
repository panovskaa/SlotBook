import { HttpException } from '@nestjs/common';
import { ApiError, ErrorCode } from '@slotbook/shared';

/** An error with one of the API's error codes. The exception filter turns it into an ApiError body. */
export class AppException extends HttpException {
  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    const body: ApiError = { statusCode, code, message, ...(details === undefined ? {} : { details }) };
    super(body, statusCode);
  }
}
