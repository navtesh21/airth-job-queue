import 'reflect-metadata';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    mkdirSync(dirname(process.env.SQLITE_PATH ?? 'data/jobs.sqlite'), { recursive: true });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Render/Railway's proxy: use X-Forwarded-For so rate limiting is per real client.
  app.set('trust proxy', 1);

  const origins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins?.length ? origins : true });

  setupApp(app);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on port ${port} (${process.env.DATABASE_URL ? 'postgres' : 'sqlite'})`, 'Bootstrap');
}

void bootstrap();
