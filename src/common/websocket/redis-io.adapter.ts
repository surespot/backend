import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

/**
 * Socket.io adapter that uses Redis Pub/Sub so that emits are broadcast
 * across all Nest/Node instances. Required when running multiple server
 * processes behind a load balancer.
 *
 * Uses the same Redis config as the rest of the app (REDIS_HOST, REDIS_PORT,
 * REDIS_PASSWORD). Sticky sessions are still required for the initial
 * Socket.io handshake; see docs/WEBSOCKET_RESILIENCE.md.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | undefined;
  private subClient: Redis | undefined;

  constructor(private readonly app: INestApplication) {
    super(app);
  }

  /**
   * Connect to Redis and create the adapter. When REDIS_HOST is set (e.g. for
   * BullMQ), the same Redis is used so Socket.io broadcasts across instances.
   * When REDIS_HOST is not set, the default in-memory adapter is used (single instance).
   */
  async connectToRedis(): Promise<void> {
    const configService = this.app.get(ConfigService);
    const host = configService.get<string>('REDIS_HOST');

    if (!host) {
      return;
    }

    const port = Number(configService.get<number>('REDIS_PORT')) ?? 6379;
    const password = configService.get<string>('REDIS_PASSWORD');

    const options: { host: string; port: number; password?: string } = {
      host,
      port,
    };
    if (password) options.password = password;

    this.pubClient = new Redis(options);
    this.subClient = this.pubClient.duplicate();

    const pub = this.pubClient;
    const sub = this.subClient;

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        pub.once('ready', () => resolve());
        pub.once('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        sub.once('ready', () => resolve());
        sub.once('error', reject);
      }),
    ]);

    this.adapterConstructor = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as ReturnType<
      IoAdapter['createIOServer']
    >;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
