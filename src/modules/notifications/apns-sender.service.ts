import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ApnsSendOptions {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  badge?: number;
}

export interface ApnsSendResult {
  token: string;
  success: boolean;
  invalidToken?: boolean;
  error?: string;
}

/**
 * Sends iOS push notifications directly via APNS, bypassing Expo's push relay.
 *
 * STUB: awaiting APNS credentials (Key ID, Team ID, .p8 auth key, bundle ID) from
 * whoever holds the Apple Developer account. Once available, set:
 *   APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (or per-app bundle ids)
 * and implement the actual send (e.g. via the `apn` package's HTTP/2 provider) below.
 */
@Injectable()
export class ApnsSenderService {
  private readonly logger = new Logger(ApnsSenderService.name);
  private warnedOnce = false;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('APNS_KEY_PATH') &&
        this.configService.get<string>('APNS_KEY_ID') &&
        this.configService.get<string>('APNS_TEAM_ID'),
    );
  }

  async sendToTokens(
    tokens: string[],
    _options: ApnsSendOptions,
  ): Promise<ApnsSendResult[]> {
    if (!this.warnedOnce) {
      this.logger.warn(
        'ApnsSenderService is a stub — APNS credentials not yet configured. iOS pushes will not be delivered.',
      );
      this.warnedOnce = true;
    }

    return tokens.map((token) => ({
      token,
      success: false,
      error: 'APNS not configured',
    }));
  }
}
