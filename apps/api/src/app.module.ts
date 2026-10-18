import { DynamicModule, Module } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { BookingsModule } from './bookings/bookings.module';
import { Clock } from './common/clock';
import { HostKeyGuard } from './common/host-key.guard';
import { APP_CONFIG, AppConfig } from './config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { SlotsModule } from './slots/slots.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, options: { logLevel?: string } = {}): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: options.logLevel ?? 'info',
            // NFR-7: every log line for a request carries its request ID.
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            redact: ['req.headers["x-host-key"]'],
          },
        }),
        PrismaModule,
        SlotsModule,
        BookingsModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_CONFIG, useValue: config }, Clock, HostKeyGuard],
      exports: [APP_CONFIG, Clock, HostKeyGuard],
    };
  }
}
