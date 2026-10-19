import { DynamicModule, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { BookingsModule } from './bookings/bookings.module';
import { Clock } from './common/clock';
import { HostKeyGuard } from './common/host-key.guard';
import { APP_CONFIG, AppConfig } from './config';
import { HealthController } from './health/health.controller';
import { HostModule } from './host/host.module';
import { MailModule } from './mail/mail.module';
import { ManageModule } from './manage/manage.module';
import { PrismaModule } from './prisma/prisma.module';
import { SlotsModule } from './slots/slots.module';
import { WaitlistModule } from './waitlist/waitlist.module';

/** Replaces the secret in /manage/:token and /waitlist/:token paths. */
export function redactTokens(url: string | undefined): string | undefined {
  return url?.replace(/\/(manage|waitlist)\/[^/?#]+/g, '/$1/[redacted]');
}

/**
 * How a request appears in the logs. Route params are dropped because they repeat path segments,
 * tokens included; the redacted URL already says which route was hit.
 */
export function serializeRequest(req: { url?: string; params?: unknown; [key: string]: unknown }) {
  const { params: _params, ...rest } = req;
  return { ...rest, url: redactTokens(req.url) };
}

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
            // Private-link tokens are credentials; keep them out of the logs (NFR-4).
            serializers: { req: serializeRequest },
          },
        }),
        EventEmitterModule.forRoot(),
        // NFR-4: in-memory counters, applied only where @UseGuards(ThrottlerGuard) appears.
        ThrottlerModule.forRoot({ throttlers: [{ ttl: config.rateLimit.windowMs, limit: config.rateLimit.limit }] }),
        PrismaModule,
        MailModule,
        SlotsModule,
        BookingsModule,
        ManageModule,
        HostModule,
        WaitlistModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_CONFIG, useValue: config }, Clock, HostKeyGuard],
      exports: [APP_CONFIG, Clock, HostKeyGuard],
    };
  }
}
