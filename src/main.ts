import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const morgan = require('morgan') as typeof import('morgan');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

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

  // CORS configuration (aligned with plan.md, configurable via env)
  const corsOrigin = configService.get<string>('CORS_ORIGIN')?.split(',') ?? [
    '*',
  ];
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  const port = Number(configService.get('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
