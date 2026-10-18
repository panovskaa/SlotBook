import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { createValidationPipe } from './common/validation';
import { AppConfig } from './config';

/** Everything main.ts sets up on the app, shared with the integration tests so they test the real thing. */
export function configureApp(app: INestApplication, config: AppConfig): INestApplication {
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({ origin: config.webOrigin, allowedHeaders: ['Content-Type', 'X-Host-Key', 'X-Request-Id'] });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
