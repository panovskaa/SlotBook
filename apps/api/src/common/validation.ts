import { ValidationError, ValidationPipe } from '@nestjs/common';
import { ErrorCode } from '@slotbook/shared';
import { AppException } from './app-exception';

/** Global validation (NFR-3): rejects unknown fields and reports every field that failed. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new AppException(400, ErrorCode.VALIDATION_ERROR, 'Some fields are invalid', flatten(errors)),
  });
}

function flatten(errors: ValidationError[], parent = ''): { field: string; messages: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, messages: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}
