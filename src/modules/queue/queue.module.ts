import { Module, Global, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('QueueModule');
        // Use 127.0.0.1 as default instead of localhost to avoid IPv6 issues on Windows
        const redisHost =
          configService.get<string>('REDIS_HOST') || '127.0.0.1';
        const redisPort =
          Number(configService.get<number>('REDIS_PORT')) || 6379;
        const redisPassword = configService.get<string>('REDIS_PASSWORD');

        // Build connection configuration according to BullMQ/ioredis documentation
        // Keep it simple - ioredis handles retries and connection management internally
        const connection: {
          host: string;
          port: number;
          password?: string;
        } = {
          host: redisHost,
          port: redisPort,
        };

        if (redisPassword) {
          connection.password = redisPassword;
          logger.log(
            `Connecting to Redis at ${redisHost}:${redisPort} (with password)`,
          );
        } else {
          logger.warn(
            'REDIS_PASSWORD not set. If Redis requires authentication, connections will fail.',
          );
          logger.log(
            `Connecting to Redis at ${redisHost}:${redisPort} (no password)`,
          );
        }

        return { connection };
      },
    }),
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
