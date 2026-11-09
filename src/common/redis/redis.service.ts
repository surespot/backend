import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') ?? '127.0.0.1';
    const port = Number(this.configService.get<string>('REDIS_PORT') ?? 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');
    this.client = new Redis({
      host,
      port,
      ...(password ? { password } : {}),
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Increment a counter. The expiry is set when the counter is created, so the
   * window runs from the first increment and is not extended by later ones.
   *
   * Increment and expiry happen in one Lua script, so a crash or Redis error can never leave
   * a counter without an expiry. A counter that somehow has none (written by older code) is
   * given one on its next increment.
   */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.eval(
      `local c = redis.call('INCR', KEYS[1])
       if c == 1 or redis.call('TTL', KEYS[1]) < 0 then
         redis.call('EXPIRE', KEYS[1], ARGV[1])
       end
       return c`,
      1,
      key,
      ttlSeconds,
    );
    return Number(count);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  /** Seconds left on a key, or a negative number when it has no expiry / does not exist */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }
}
