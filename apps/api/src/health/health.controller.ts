import { Controller, Get, Res } from '@nestjs/common';
import { HealthResponse } from '@slotbook/shared';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from '../common/docs';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Checks the API and the database connection (NFR-7). */
  @Doc('Checks the API and the database', { 200: 'Both up', 503: 'Database down' })
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      res.status(503);
      return { status: 'error', database: 'down' };
    }
  }
}
