import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

/** One line per endpoint for the OpenAPI docs: what it does, and each status it can answer with. */
export function Doc(summary: string, responses: Record<number, string>) {
  return applyDecorators(
    ApiOperation({ summary }),
    ...Object.entries(responses).map(([status, description]) => ApiResponse({ status: Number(status), description })),
  );
}
