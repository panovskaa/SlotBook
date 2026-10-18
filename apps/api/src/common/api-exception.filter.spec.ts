import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiExceptionFilter } from './api-exception.filter';
import { AppException } from './app-exception';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('passes an AppException body through unchanged', () => {
    const body = filter.toApiError(new AppException(409, 'SLOT_OVERLAP', 'Overlaps', { id: 1 }));
    expect(body).toEqual({ statusCode: 409, code: 'SLOT_OVERLAP', message: 'Overlaps', details: { id: 1 } });
  });

  it('gives built-in Nest errors a code', () => {
    expect(filter.toApiError(new NotFoundException('Cannot GET /x'))).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Cannot GET /x',
    });
  });

  it('maps a Prisma unique violation (P2002) to 409, not 500', () => {
    expect(filter.toApiError(prismaError('P2002'))).toMatchObject({ statusCode: 409, code: 'SLOT_ALREADY_BOOKED' });
  });

  it('maps a Prisma missing record (P2025) to 404', () => {
    expect(filter.toApiError(prismaError('P2025'))).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('hides the details of unexpected errors', () => {
    expect(filter.toApiError(new Error('secret stack detail'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
  });
});
