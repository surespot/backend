import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './common/websocket/redis-io.adapter';
import helmet from 'helmet';
import { validateEnv } from './common/config/env.validation';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const morgan = require('morgan') as typeof import('morgan');

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    validateEnv();
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Route all NestJS Logger (new Logger()) calls through Winston → Loki
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const configService = app.get(ConfigService);

  // Use Redis adapter for Socket.io when REDIS_HOST is set (multi-instance deployments)
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Global exception filter — normalises unexpected errors; passes through app-shaped HttpExceptions
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Security headers
  app.use(helmet());

  // HTTP request logging with Morgan
  app.use(morgan('combined'));

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS configuration
  const rawCorsOrigin = configService.get<string>('CORS_ORIGIN');
  if (!rawCorsOrigin && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN env var must be set in production');
  }
  const corsOrigin = rawCorsOrigin?.split(',') ?? ['*'];
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-verification-token',
      'x-bootstrap-token',
    ],
  });

  // Swagger setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SureSpot API')
    .setDescription('SureSpot food delivery API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // Graceful shutdown: drain connections on SIGTERM/SIGINT
  app.enableShutdownHooks();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, async () => {
      await redisIoAdapter.closeRedis();
      await app.close();
      process.exit(0);
    });
  }

  const port = Number(configService.get('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
