import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { createValidationPipe } from './common/validation';
import { AppConfig } from './config';

export const DOCS_PATH = 'api/docs';
export const HOST_KEY_SECURITY = 'host-key';

/** Everything main.ts sets up on the app, shared with the integration tests so they test the real thing. */
export function configureApp(app: INestApplication, config: AppConfig): INestApplication {
  app.useLogger(app.get(Logger));
  // Behind a proxy every request comes from the proxy's address. Trusting exactly N hops of
  // X-Forwarded-For gives the real visitor IP for rate limits, without letting a client fake it.
  if (config.trustProxy > 0) (app as NestExpressApplication).set('trust proxy', config.trustProxy);
  app.use(securityHeaders());
  app.enableCors({ origin: config.webOrigin, allowedHeaders: ['Content-Type', 'X-Host-Key', 'X-Request-Id'] });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  setUpDocs(app);
  app.enableShutdownHooks();
  return app;
}

/**
 * Helmet's strict defaults everywhere (NFR-4). Swagger UI's page needs inline styles and data:
 * images, so only the docs pages get a slightly looser content security policy.
 */
function securityHeaders() {
  const strict = helmet();
  const docs = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  });
  return (req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(`/${DOCS_PATH}`) ? docs(req, res, next) : strict(req, res, next);
}

/** Swagger/OpenAPI at /api/docs, with the raw document at /api/docs-json (SRS 4.2). */
function setUpDocs(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SlotBook API')
      .setVersion('1.0')
      .setDescription(
        [
          'Scheduling API for a single host. Times are ISO 8601 in UTC; dates and start times the host',
          'enters are read in the app time zone (APP_TIMEZONE).',
          '',
          'Every error has the shape `{ statusCode, code, message, details? }`. Codes: VALIDATION_ERROR,',
          'SLOT_IN_PAST, SLOT_OVERLAP, SLOT_ALREADY_BOOKED, BOOKING_CUTOFF, CANCELLATION_CUTOFF, NOT_FOUND,',
          'UNAUTHORIZED, plus ALREADY_ON_WAITLIST, DATE_HAS_AVAILABILITY, RATE_LIMITED and INTERNAL_ERROR.',
        ].join('\n'),
      )
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'X-Host-Key', description: 'The HOST_ACCESS_KEY value' },
        HOST_KEY_SECURITY,
      )
      .build(),
  );
  SwaggerModule.setup(DOCS_PATH, app, document, { jsonDocumentUrl: `${DOCS_PATH}-json` });
}
