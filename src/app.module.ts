import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { AuthModule } from './modules/auth/auth.module';
import { SavedLocationsModule } from './modules/saved-locations/saved-locations.module';
import { PromotionsModule } from './modules/promotions/promotions.module';

@Module({
  imports: [
    // Environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.development',
    }),

    // Database (MongoDB)
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri:
          config.get<string>('MONGODB_URI') ??
          'mongodb://localhost:27017/surespot',
        dbName: config.get<string>('MONGODB_DB_NAME') ?? 'surespot',
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): ThrottlerModuleOptions => {
        const windowMs = Number(config.get('RATE_LIMIT_WINDOW_MS') ?? 60_000);
        const max = Number(config.get('RATE_LIMIT_MAX_REQUESTS') ?? 100);

        return [
          {
            ttl: windowMs / 1000,
            limit: max,
          },
        ];
      },
    }),

    // Logger
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(
              ({
                level,
                message,
                timestamp,
                context,
              }: {
                level: string;
                message: string;
                timestamp: string;
                context?: unknown;
              }) => {
                const contextString =
                  typeof context === 'string'
                    ? context
                    : context != null
                      ? JSON.stringify(context)
                      : '';
                const contextPart = contextString ? ` [${contextString}]` : '';
                return `${timestamp} [${level}]${contextPart} ${message}`;
              },
            ),
          ),
        }),
      ],
    }),

    // Cloudinary (global media service)
    CloudinaryModule,

    // Scheduling (cron jobs)
    ScheduleModule.forRoot(),

    // Auth module
    AuthModule,

    // Saved Locations module
    SavedLocationsModule,

    // Promotions module
    PromotionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
