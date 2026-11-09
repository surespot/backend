import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../../common/redis/redis.service';

export const TARGET_RATE_LIMIT_KEY = 'targetRateLimit';

export interface TargetRateLimitOptions {
  /** Counter family, e.g. 'reg-send'. Routes sharing a scope share one budget per target. */
  scope: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Limit how often one phone number / email address / identifier may be used on a route,
 * no matter which IP the requests come from.
 *
 * This is what protects OTP endpoints. A per-IP limit alone is the wrong tool there: many
 * real users share one IP behind a mobile carrier's NAT, so it has to stay generous, while
 * the thing that actually needs protecting (one phone being spammed or guessed at) is
 * identified by the phone, not the IP.
 */
export const TargetRateLimit = (
  scope: string,
  limit: number,
  windowSeconds = 60,
) =>
  SetMetadata(TARGET_RATE_LIMIT_KEY, {
    scope,
    limit,
    windowSeconds,
  } satisfies TargetRateLimitOptions);

@Injectable()
export class TargetRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(TargetRateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<TargetRateLimitOptions | undefined>(
      TARGET_RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!options) return true;

    const body = context.switchToHttp().getRequest<{ body?: unknown }>().body as
      | { phone?: unknown; email?: unknown; identifier?: unknown }
      | undefined;
    const raw = body?.phone ?? body?.email ?? body?.identifier;
    // Nothing usable to key on: the validation pipe will reject the request anyway
    if (typeof raw !== 'string' || !raw.trim()) return true;

    const key = `ratelimit:${options.scope}:${raw.trim().toLowerCase().slice(0, 120)}`;

    let count: number;
    let ttl: number;
    try {
      count = await this.redis.incrWithTtl(key, options.windowSeconds);
      ttl = count > options.limit ? await this.redis.ttl(key) : 0;
    } catch (err) {
      // Redis trouble must never block signups or logins
      this.logger.warn(
        `Rate limit check skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }

    if (count > options.limit) {
      const retryAfter = ttl > 0 ? ttl : options.windowSeconds;
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Too many requests for this number or email. Please wait ${retryAfter} second(s) and try again.`,
            details: { retryAfter },
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
