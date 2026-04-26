import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ThrottlerModule,
  ThrottlerModuleOptions,
  ThrottlerGuard,
} from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import LokiTransport from 'winston-loki';
import { getCorrelationId } from './common/correlation/correlation.context';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { SavedLocationsModule } from './modules/saved-locations/saved-locations.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { FoodItemsModule } from './modules/food-items/food-items.module';
import { RegionsModule } from './modules/regions/regions.module';
import { PickupLocationsModule } from './modules/pickup-locations/pickup-locations.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QueueModule } from './modules/queue/queue.module';
import { RidersModule } from './modules/riders/riders.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { ChatModule } from './modules/chat/chat.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { IntegrationsTestModule } from './modules/integrations-test/integrations-test.module';
import { HealthModule } from './modules/health/health.module';
import { CorrelationMiddleware } from './common/correlation/correlation.middleware';
import { HttpMetricsMiddleware } from './common/metrics/http-metrics.middleware';

@Module({
  imports: [
    // Environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env.production'
          : '.env.development',
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
                const correlationId = getCorrelationId();
                const correlationPart = correlationId
                  ? ` rid:${correlationId}`
                  : '';
                return `${timestamp} [${level}]${contextPart}${correlationPart} ${message}`;
              },
            ),
          ),
        }),
        // Ship logs to Loki when configured (production)
        ...(process.env.LOKI_URL
          ? [
              new LokiTransport({
                host: process.env.LOKI_URL,
                labels: {
                  app: 'surespot-backend',
                  env: process.env.NODE_ENV ?? 'development',
                },
                format: winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.json(),
                ),
                onConnectionError: (err) =>
                  console.error('Loki connection error:', err),
              }),
            ]
          : []),
      ],
    }),

    // Metrics (Prometheus)
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      path: '/metrics',
    }),

    // Storage (Cloudinary or S3 - switchable via STORAGE_PROVIDER)
    StorageModule.forRoot(),

    // Scheduling (cron jobs)
    ScheduleModule.forRoot(),

    // Auth module
    AuthModule,

    // Saved Locations module
    SavedLocationsModule,

    // Promotions module
    PromotionsModule,

    // Food Items module
    FoodItemsModule,

    // Regions module (admin)
    RegionsModule,

    // Pickup Locations module
    PickupLocationsModule,

    // Cart module
    CartModule,

    // Orders module
    OrdersModule,

    // Transactions module (Paystack)
    TransactionsModule,

    // Notifications module
    NotificationsModule,

    // Queue module (BullMQ)
    QueueModule,

    // Riders module
    RidersModule,

    // Wallets module
    WalletsModule,

    // Chat module
    ChatModule,

    // Support module
    SupportModule,

    // Admin Dashboard module
    AdminModule,

    // Integrations test (admin-only connectivity checks)
    IntegrationsTestModule,

    // Health checks
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware, HttpMetricsMiddleware).forRoutes('*');
  }
}
