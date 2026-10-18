import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readConfig } from './config';
import { configureApp } from './configure-app';
import { loadEnv } from './load-env';

async function bootstrap(): Promise<void> {
  loadEnv();
  const config = readConfig();
  const app = await NestFactory.create(AppModule.forRoot(config), { bufferLogs: true });
  configureApp(app, config);
  await app.listen(config.port);
}

void bootstrap();
