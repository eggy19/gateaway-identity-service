import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // Better Auth consumes the raw request body, so Nest's global body parser is
  // disabled. The Better Auth node handler is mounted ahead of the JSON parser
  // (see Milestone 2); every other route gets the JSON/urlencoded parsers below.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    bodyParser: false,
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const config = app.get(ConfigService);
  const { port, corsOrigin } = config.getOrThrow<AppConfig>('app');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableCors({ origin: corsOrigin, credentials: true });
  app.setGlobalPrefix('api/v1');

  await app.listen(port);
  Logger.log(`Identity Service listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
