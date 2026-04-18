import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private configService: ConfigService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const host = this.configService.get<string>('REDIS_HOST');
    if (!host) {
      return this.getStatus(key, true, { message: 'Redis not configured' });
    }

    const client = new Redis({
      host,
      port: Number(this.configService.get('REDIS_PORT') ?? 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      connectTimeout: 3000,
      lazyConnect: true,
    });

    try {
      await client.connect();
      await client.ping();
      return this.getStatus(key, true);
    } catch (err) {
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    } finally {
      await client.quit();
    }
  }
}
