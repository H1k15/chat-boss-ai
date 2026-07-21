import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  const port = process.env.BACKEND_PORT || 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Chat Boss AI backend chạy tại http://localhost:${port}/api/v1`);
}
bootstrap();
