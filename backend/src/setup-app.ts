import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Shared between main.ts and the e2e tests so tests exercise the real configuration. */
export function setupApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
